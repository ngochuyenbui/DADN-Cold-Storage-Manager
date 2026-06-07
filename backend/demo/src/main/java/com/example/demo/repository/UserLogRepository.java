package com.example.demo.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import com.example.demo.entity.UserLog;

public interface UserLogRepository extends JpaRepository<UserLog, Integer> {

       @Modifying
       @Transactional
       long deleteByUserId(UUID userId);

    @Query("SELECT l FROM UserLog l WHERE " +
           "(:userId IS NULL OR l.userId = :userId) AND " +
           "(:typeActionsEmpty = TRUE OR l.typeAction IN :typeActions) AND " +
           "(:excludeAdmin = FALSE OR l.userId IN (" +
           "  SELECT u.userId FROM User u WHERE u.role.roleName <> 'ADMIN'" +
          ")) AND " +
          "(:restrictAuthToSelf = FALSE OR l.typeAction NOT IN ('LOGIN', 'LOGOUT', 'CHANGE_PASSWORD') OR l.userId = :currentUserId) " +
           "ORDER BY l.timestamp DESC")
    Page<UserLog> findFiltered(
            @Param("userId") UUID userId,
            @Param("typeActions") List<String> typeActions,
            @Param("typeActionsEmpty") boolean typeActionsEmpty,
            @Param("excludeAdmin") boolean excludeAdmin,
           @Param("restrictAuthToSelf") boolean restrictAuthToSelf,
           @Param("currentUserId") UUID currentUserId,
            Pageable pageable);
}
