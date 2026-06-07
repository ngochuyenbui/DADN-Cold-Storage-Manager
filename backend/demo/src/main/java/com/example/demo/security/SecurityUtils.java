package com.example.demo.security;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SecurityUtils {

    private final UserRepository userRepository;

    /** Trả về username của người đang đăng nhập từ SecurityContext. */
    public String currentUsername() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return "anonymous";
        return auth.getName();
    }

    /** Trả về UUID của người đang đăng nhập, null nếu không tìm thấy. */
    public UUID currentUserId() {
        return userRepository.findByUsername(currentUsername())
                .map(User::getUserId)
                .orElse(null);
    }

    /** Trả về User entity của người đang đăng nhập. */
    public Optional<User> currentUser() {
        return userRepository.findByUsername(currentUsername());
    }
}
