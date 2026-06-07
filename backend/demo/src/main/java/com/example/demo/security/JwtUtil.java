package com.example.demo.security;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Component
public class JwtUtil {

    private static final String CLAIM_ROLE = "role";
    private static final String CLAIM_TYPE = "type";
    private static final String CLAIM_EMAIL = "email";
    private static final String TOKEN_TYPE_RESET_PASSWORD = "reset-password";

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration-ms:86400000}") // 24h default
    private long expirationMs;

    @Value("${jwt.reset-password-expiration-ms:900000}") // 15m default
    private long resetPasswordExpirationMs;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generate(String username, String role) {
        return Jwts.builder()
                .subject(username)
                .claim(CLAIM_ROLE, role)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(key())
                .compact();
    }

    public String generatePasswordResetToken(String username, String email) {
        return Jwts.builder()
                .subject(username)
                .claim(CLAIM_TYPE, TOKEN_TYPE_RESET_PASSWORD)
                .claim(CLAIM_EMAIL, email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + resetPasswordExpirationMs))
                .signWith(key())
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key()).build()
                .parseSignedClaims(token).getPayload();
    }

    public String getUsername(String token) {
        return parse(token).getSubject();
    }

    public String getRole(String token) {
        return parse(token).get(CLAIM_ROLE, String.class);
    }

    public boolean isResetPasswordToken(String token) {
        try {
            return TOKEN_TYPE_RESET_PASSWORD.equals(parse(token).get(CLAIM_TYPE, String.class));
        } catch (Exception e) {
            return false;
        }
    }

    public String getEmail(String token) {
        return parse(token).get(CLAIM_EMAIL, String.class);
    }

    public boolean isValid(String token) {
        try {
            parse(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
