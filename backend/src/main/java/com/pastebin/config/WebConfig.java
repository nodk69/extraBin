package com.pastebin.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.ForwardedHeaderFilter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.pastebin.shared.security.PeerSnapshotFilter;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    /**
     * Snapshots the genuine TCP peer address at the very front of the chain so that
     * ClientIpResolver can evaluate its trusted-proxy policy against the original peer
     * (P1-01). Must run BEFORE ForwardedHeaderFilter rewrites request.getRemoteAddr().
     */
    @Bean
    public FilterRegistrationBean<PeerSnapshotFilter> peerSnapshotFilter() {
        FilterRegistrationBean<PeerSnapshotFilter> bean = new FilterRegistrationBean<>(new PeerSnapshotFilter());
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }

    /**
     * Rewrites scheme/host/port from forwarded headers (needed for correct HTTPS-aware
     * URL and cookie behaviour behind the reverse proxy).
     * Order is now strictly AFTER PeerSnapshotFilter (+1) so the snapshot is taken first.
     */
    @Bean
    public FilterRegistrationBean<ForwardedHeaderFilter> forwardedHeaderFilter() {
        FilterRegistrationBean<ForwardedHeaderFilter> bean = new FilterRegistrationBean<>(new ForwardedHeaderFilter());
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return bean;
    }
}
