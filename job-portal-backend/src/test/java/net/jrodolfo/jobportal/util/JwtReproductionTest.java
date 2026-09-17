package net.jrodolfo.jobportal.util;

import net.jrodolfo.jobportal.exception.ResourceException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** Regression coverage for the former unsigned Google ID-token trust path. */
class JwtReproductionTest {

    @Test
    void forgedRs256GoogleTokenCannotBecomeAnApplicationIdentity() {
        JwtUtil jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secretKey", "MY_SECRET_KEY_123456789012345678901234567890");
        String forgedToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9."
                + "eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJlbWFpbCI6ImFkbWluQGxvY2FsLnRlc3QiLCJleHAiOjIxNDc0ODM2NDd9."
                + "forged-signature";

        assertThrows(ResourceException.class, () -> jwtUtil.extractEmail(forgedToken));
        assertFalse(jwtUtil.validateToken(forgedToken, "admin@local.test"));
    }
}
