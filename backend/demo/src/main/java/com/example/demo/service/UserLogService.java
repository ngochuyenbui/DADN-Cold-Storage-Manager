package com.example.demo.service;

import com.example.demo.entity.UserLog;
import com.example.demo.repository.UserLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserLogService {

    private final UserLogRepository userLogRepository;

    /**
     * Ghi log bất đồng bộ — không block request chính.
     * @param userId      UUID của user thực hiện hành động
     * @param typeAction  Loại hành động: LOGIN, LOGOUT, CONTROL, SET_THRESHOLD, CREATE_USER, UPDATE_USER, DELETE_USER
     * @param description Mô tả chi tiết
     */
    @Async
    public void log(UUID userId, String typeAction, String description) {
        UserLog entry = new UserLog();
        entry.setUserId(userId);
        entry.setTypeAction(typeAction);
        entry.setDescription(description);
        entry.setTimestamp(LocalDateTime.now());
        userLogRepository.save(entry);
    }
}
