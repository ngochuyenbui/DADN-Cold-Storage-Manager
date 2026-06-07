package com.example.demo.controller;

import com.example.demo.entity.Food;
import com.example.demo.repository.FoodRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.sql.Date;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/foods")
@RequiredArgsConstructor
public class FoodController {

    private final FoodRepository foodRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;
    private final EntityManager em;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(required = false) Integer roomId) {
        if (roomId == null) {
            return ResponseEntity.ok(foodRepo.findAll());
        }

        List<Map<String, Object>> rows = em.createNativeQuery(
                "SELECT f.food_id as foodId, f.name, f.type, f.expire_date as expireDate, " +
                "f.imported_date as importedDate, f.description, f.min_humid as minHumid, " +
                "f.max_humid as maxHumid, f.min_temper as minTemper, f.max_temper as maxTemper, " +
                "f.weight, fh.room_id as roomId " +
                "FROM food f JOIN food_has fh ON f.food_id = fh.food_id " +
                "WHERE fh.room_id = :roomId")
            .setParameter("roomId", roomId)
            .unwrap(org.hibernate.query.NativeQuery.class)
            .setTupleTransformer((tuple, aliases) -> {
                java.util.Map<String, Object> map = new java.util.HashMap<>();
                for (int i = 0; i < aliases.length; i++) {
                    map.put(aliases[i], tuple[i]);
                }
                return map;
            })
            .getResultList();

        return ResponseEntity.ok(rows);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        Integer roomId = body.containsKey("roomId") ? (Integer) body.get("roomId") : null;
        if (roomId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "roomId is required"));
        }

        Food food = new Food();
        food.setName((String) body.get("name"));
        food.setType((String) body.getOrDefault("type", ""));
        food.setDescription((String) body.getOrDefault("description", ""));
        food.setWeight(toDouble(body.get("weight")));
        food.setMinHumid(toDouble(body.get("minHumid")));
        food.setMaxHumid(toDouble(body.get("maxHumid")));
        food.setMinTemper(toDouble(body.get("minTemper")));
        food.setMaxTemper(toDouble(body.get("maxTemper")));
        if (body.containsKey("expireDate") && body.get("expireDate") != null) {
            food.setExpireDate(Date.valueOf((String) body.get("expireDate")).toLocalDate());
        }
        if (body.containsKey("importedDate") && body.get("importedDate") != null) {
            food.setImportedDate(Date.valueOf((String) body.get("importedDate")).toLocalDate());
        }
        foodRepo.save(food);

        em.createNativeQuery("INSERT INTO food_has (food_id, room_id) VALUES (?, ?)")
            .setParameter(1, food.getFoodId())
            .setParameter(2, roomId)
            .executeUpdate();

        userLogService.log(securityUtils.currentUserId(), "CREATE_FOOD",
                "Tạo thực phẩm: " + food.getName());
        return ResponseEntity.ok(food);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        Food food = foodRepo.findById(id).orElse(null);
        if (food == null) return ResponseEntity.notFound().build();

        if (body.containsKey("name")) food.setName((String) body.get("name"));
        if (body.containsKey("type")) food.setType((String) body.get("type"));
        if (body.containsKey("description")) food.setDescription((String) body.get("description"));
        if (body.containsKey("weight")) food.setWeight(toDouble(body.get("weight")));
        if (body.containsKey("minHumid")) food.setMinHumid(toDouble(body.get("minHumid")));
        if (body.containsKey("maxHumid")) food.setMaxHumid(toDouble(body.get("maxHumid")));
        if (body.containsKey("minTemper")) food.setMinTemper(toDouble(body.get("minTemper")));
        if (body.containsKey("maxTemper")) food.setMaxTemper(toDouble(body.get("maxTemper")));
        if (body.containsKey("expireDate") && body.get("expireDate") != null) {
            food.setExpireDate(Date.valueOf((String) body.get("expireDate")).toLocalDate());
        }
        if (body.containsKey("importedDate") && body.get("importedDate") != null) {
            food.setImportedDate(Date.valueOf((String) body.get("importedDate")).toLocalDate());
        }

        foodRepo.save(food);
        userLogService.log(securityUtils.currentUserId(), "UPDATE_FOOD",
                "Cập nhật thực phẩm: " + food.getName());
        return ResponseEntity.ok(food);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        Food food = foodRepo.findById(id).orElse(null);
        if (food == null) return ResponseEntity.notFound().build();

        em.createNativeQuery("DELETE FROM sched_has WHERE food_id = ?")
            .setParameter(1, id)
            .executeUpdate();
        em.createNativeQuery("DELETE FROM food_has WHERE food_id = ?")
            .setParameter(1, id)
            .executeUpdate();
        foodRepo.deleteById(id);

        userLogService.log(securityUtils.currentUserId(), "DELETE_FOOD",
                "Xóa thực phẩm: " + food.getName());
        return ResponseEntity.ok(Map.of("message", "Đã xóa thực phẩm"));
    }

    private Double toDouble(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
