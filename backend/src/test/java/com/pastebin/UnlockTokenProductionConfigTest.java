package com.pastebin;

import com.pastebin.paste.application.UnlockTokenService;
import com.pastebin.shared.errors.UnauthorizedException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Production security gate for the unlock-token signing key.
 *
 * <p>These tests activate the real {@code prod} profile and construct the real
 * {@link UnlockTokenService} bean, so the fail-closed path being asserted is the same
 * constructor production uses — not a helper method.</p>
 */
class UnlockTokenProductionConfigTest {

    private static final String VALID_SECRET = "production-unlock-secret-32-bytes-minimum!!";

    @Configuration
    @Import(UnlockTokenService.class)
    static class TokenConfig {
    }

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withUserConfiguration(TokenConfig.class);
    }

    private ApplicationContextRunner prodRunner(String... properties) {
        return runner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
                .withPropertyValues(properties);
    }

    @Test
    void prod_withoutSecret_refusesToStart() {
        prodRunner().run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasRootCauseInstanceOf(IllegalStateException.class)
                    .hasStackTraceContaining("the production unlock-token secret is missing or blank");
        });
    }

    @Test
    void prod_withBlankSecret_refusesToStart() {
        prodRunner("pastebin.share.unlock-secret=").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasStackTraceContaining("is missing or blank");
        });
    }

    @Test
    void prod_withShortSecret_refusesToStart() {
        prodRunner("pastebin.share.unlock-secret=short-secret").run(context -> {
            assertThat(context).hasFailed();
            Throwable failure = context.getStartupFailure();
            assertThat(failure).hasStackTraceContaining("is shorter than the required 32 bytes");
            assertThat(org.assertj.core.util.Throwables.getStackTrace(failure))
                    .as("startup failures must never echo the secret value")
                    .doesNotContain("short-secret");
        });
    }

    @Test
    void prod_withWhitespacePaddedSecret_refusesToStart() {
        // Raw property source: TestPropertyValues trims values, real environment entries do not.
        runner()
                .withInitializer(context -> {
                    context.getEnvironment().setActiveProfiles("prod");
                    context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
                            "raw-secret",
                            Map.of("pastebin.share.unlock-secret", " " + VALID_SECRET + " ")));
                })
                .run(context -> {
                    assertThat(context).hasFailed();
                    assertThat(context.getStartupFailure())
                            .hasStackTraceContaining("has leading or trailing whitespace");
                });
    }

    @Test
    void prod_withRetiredDevelopmentDefault_refusesToStart() {
        prodRunner("pastebin.share.unlock-secret=" + UnlockTokenService.RETIRED_DEVELOPMENT_SECRET).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasStackTraceContaining("retired public development default");
        });
    }

    @Test
    void prod_withNonPositiveTtl_refusesToStart() {
        prodRunner(
                "pastebin.share.unlock-secret=" + VALID_SECRET,
                "pastebin.share.unlock-ttl-seconds=0").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasStackTraceContaining("unlock-ttl-seconds must be a positive number");
        });
    }

    @Test
    void prod_withValidSecret_startsAndIssuesUsableTokens() {
        prodRunner("pastebin.share.unlock-secret=" + VALID_SECRET).run(context -> {
            assertThat(context).hasNotFailed();
            UnlockTokenService service = context.getBean(UnlockTokenService.class);

            var generated = service.generateToken("paste_abc", "203.0.113.7");

            assertThat(service.validateToken(generated.token(), "paste_abc", "203.0.113.7"))
                    .isPresent();
        });
    }

    @Test
    void prod_withDifferentSecret_cannotValidateForeignToken() {
        String[] otherToken = new String[1];
        prodRunner("pastebin.share.unlock-secret=" + VALID_SECRET).run(context -> {
            UnlockTokenService service = context.getBean(UnlockTokenService.class);
            otherToken[0] = service.generateToken("paste_abc", "203.0.113.7").token();
        });

        prodRunner("pastebin.share.unlock-secret=another-production-unlock-secret-32-bytes!")
                .run(context -> {
                    UnlockTokenService service = context.getBean(UnlockTokenService.class);
                    assertThatThrownBy(() -> service.validateToken(otherToken[0], "paste_abc", "203.0.113.7"))
                            .isInstanceOf(UnauthorizedException.class);
                });
    }

    @Test
    void nonProd_withoutSecret_startsWithAnEphemeralPerProcessKey() {
        String[] firstToken = new String[1];
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            UnlockTokenService service = context.getBean(UnlockTokenService.class);
            firstToken[0] = service.generateToken("paste_abc", "203.0.113.7").token();
        });

        runner().run(context -> {
            UnlockTokenService service = context.getBean(UnlockTokenService.class);
            assertThatThrownBy(() -> service.validateToken(firstToken[0], "paste_abc", "203.0.113.7"))
                    .as("a fresh process must not accept tokens signed with another ephemeral key")
                    .isInstanceOf(UnauthorizedException.class);
        });
    }

    @Test
    void prodConfigurationFile_declaresNoDefaultSecret() throws Exception {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("application-prod", new ClassPathResource("application-prod.yml"));

        Object configured = sources.stream()
                .map(source -> source.getProperty("pastebin.share.unlock-secret"))
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);

        assertThat(configured)
                .as("application-prod.yml must resolve the secret from the environment without a fallback")
                .isEqualTo("${PASTEBIN_SHARE_UNLOCK_SECRET:}");
    }
}
