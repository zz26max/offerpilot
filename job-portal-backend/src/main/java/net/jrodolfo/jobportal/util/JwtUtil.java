package net.jrodolfo.jobportal.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import net.jrodolfo.jobportal.exception.ResourceException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.Objects;


/**
 * Utility class for handling JSON Web Tokens (JWT).
 * Provides methods to generate, parse, and validate tokens.
 * Only accepts tokens issued by this application and signed with its HS256 key.
 */
@Component
public class JwtUtil {
    @org.springframework.beans.factory.annotation.Value("${jwt.secret}")
    private String secretKey;

    private static final long EXPIRATION_TIME = 86_400_000; // 1 day (in milliseconds)

    private Key getSigningKey() {
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Generates a JWT token for a given email address.
     * The token includes the email as the subject and has a predefined expiration time.
     *
     * @param email the email address to include in the token subject
     * @return the generated JWT token string
     */
    public String generateToken(String email) {

        return Jwts.builder()
                .setSubject(email).setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION_TIME))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * Extracts the email address (subject) from a JWT token.
     * Tokens from external identity providers are deliberately rejected here. They
     * must be verified by Spring Security's OAuth/OIDC support and exchanged for
     * an application-issued token.
     *
     * @param token the JWT token string
     * @return the email address extracted from the token
     * @throws IllegalArgumentException if the token is null or empty
     * @throws ResourceException         if an error occurs during token parsing
     */
    public String extractEmail(String token) {

        if (token == null || token.trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid token");
        }
        token = token.trim();

        JwtParser jwtParser = Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .setAllowedClockSkewSeconds(300) // 5 minutes
                .build();

        Jws<Claims> claimsJws;

        try {
            claimsJws = jwtParser.parseClaimsJws(token);
        } catch (Exception e) {
            throw new ResourceException(e);
        }

        return claimsJws.getBody().getSubject();
    }

    /**
     * Validates a JWT token against a given email address.
     * Checks if the token is correctly signed, matches the provided email, and has not expired.
     *
     * @param token the JWT token string to validate
     * @param email the email address to validate against
     * @return {@code true} if the token is valid, {@code false} otherwise
     */
    public boolean validateToken(String token, String email) {

        if (token != null) {
            token = token.trim();
        }

        try {
            Claims claims = Jwts.parserBuilder()
                    .setSigningKey(getSigningKey())
                    .setAllowedClockSkewSeconds(60)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();

            return Objects.equals(claims.getSubject(), email)
                    && claims.getExpiration() != null
                    && claims.getExpiration().after(new Date());

        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
