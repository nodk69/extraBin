package com.pastebin.identity.application;

import com.pastebin.identity.domain.User;
import com.pastebin.identity.infrastructure.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;

/**
 * Regression coverage for the concurrent first-login race on
 * {@code POST /api/v1/auth/supabase-sync}.
 *
 * <p>Two requests for the same Supabase identity both see no local row, both insert,
 * and the loser hits {@code uq_users_email}. The recovery read must run on a clean
 * transaction: doing it on the session that had just failed produced
 * {@code AssertionFailure: null id in com.pastebin.identity.domain.User entry
 * (don't flush the Session after an exception occurs)} and a 500.
 */
@SpringBootTest
@ActiveProfiles("test")
class SupabaseUserProvisioningRaceTest {

    private static final String RACED_EMAIL = "race-winner@example.com";

    @Autowired
    private AuthService authService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @SpyBean
    private UserRepository userRepository;

    @Test
    void provision_reusesTheAccountCommittedByTheWinningLogin() {
        User winner = userRepository.save(new User("race_winner", RACED_EMAIL, "irrelevant-hash", "ROLE_USER"));

        // The losing request's pre-check ran before the winner committed, so it observes
        // no row and attempts the colliding insert; the recovery read must then find it.
        // (A Spring Data repository is an interface proxy, so Mockito cannot call its
        // real method directly; the second result is captured before the race instead.)
        doReturn(Optional.empty())
                .doReturn(Optional.of(winner))
                .when(userRepository).findByEmail(RACED_EMAIL);

        // Mirrors syncSupabaseUser's @Transactional boundary: provisioning is called from
        // inside an already-open transaction, which is what made the recovery read reuse
        // the session that had just failed.
        User resolved = new TransactionTemplate(transactionManager)
                .execute(status -> authService.provisionLocalUser(RACED_EMAIL, "race_loser"));

        assertThat(resolved.getId()).isEqualTo(winner.getId());
        assertThat(resolved.getUsername()).isEqualTo("race_winner");
        assertThat(userRepository.findByUsername("race_loser"))
                .as("the losing request must not leave a half-inserted account behind")
                .isEmpty();
    }

    @Test
    void provision_fallsBackToTheNextFreeUsernameWhenAnotherIdentityTookTheBase() {
        userRepository.save(new User("IG_Cmmt", "first-owner@example.com", "irrelevant-hash", "ROLE_USER"));

        // The losing request resolved the username before that row committed, so its first
        // candidate is the now-taken base name.
        doReturn(false).doReturn(true).when(userRepository).existsByUsername("IG_Cmmt");

        User resolved = new TransactionTemplate(transactionManager)
                .execute(status -> authService.provisionLocalUser("second-owner@example.com", "IG_Cmmt"));

        assertThat(resolved.getEmail()).isEqualTo("second-owner@example.com");
        assertThat(resolved.getUsername()).isEqualTo("IG_Cmmt_1");
        assertThat(userRepository.findByUsername("IG_Cmmt").orElseThrow().getEmail())
                .as("the first owner keeps the base username")
                .isEqualTo("first-owner@example.com");
    }

    @Test
    void provision_createsAndReturnsAnAccountForANewIdentity() {
        User created = authService.provisionLocalUser("fresh-login@example.com", "fresh_login");

        assertThat(created.getId()).isNotNull();
        assertThat(created.getEmail()).isEqualTo("fresh-login@example.com");
        assertThat(created.getUsername()).isEqualTo("fresh_login");
        assertThat(created.isEmailVerified()).isTrue();
        assertThat(userRepository.existsByEmail("fresh-login@example.com")).isTrue();
    }
}
