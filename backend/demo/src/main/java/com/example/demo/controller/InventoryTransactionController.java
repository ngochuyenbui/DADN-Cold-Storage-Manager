package com.example.demo.controller;

import com.example.demo.entity.BoxType;
import com.example.demo.entity.InventoryTransaction;
import com.example.demo.entity.InventoryTransactionItem;
import com.example.demo.entity.StorageRoom;
import com.example.demo.repository.BoxTypeRepository;
import com.example.demo.repository.InventoryTransactionItemRepository;
import com.example.demo.repository.InventoryTransactionRepository;
import com.example.demo.repository.StorageRoomRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/inventory-transactions")
@RequiredArgsConstructor
public class InventoryTransactionController {

    private final InventoryTransactionRepository transactionRepo;
    private final InventoryTransactionItemRepository itemRepo;
    private final BoxTypeRepository boxTypeRepo;
    private final StorageRoomRepository roomRepo;
    private final SecurityUtils securityUtils;
    private final UserLogService userLogService;
    private final EntityManager em;

    @GetMapping
    public ResponseEntity<?> list(
            @RequestParam(defaultValue = "ALL") String type,
            @RequestParam(required = false) Integer areaId,
            @RequestParam(required = false) Integer roomId,
            @RequestParam(defaultValue = "") String query
    ) {
        String normalizedType = normalizeType(type);
        if (normalizedType == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "type must be ALL, IN or OUT"));
        }

        String q = query == null ? "" : query.trim().toLowerCase();
        String qLike = "%" + q + "%";

        StringBuilder sql = new StringBuilder(
                "SELECT t.transaction_id AS transactionId, t.transaction_type AS transactionType, " +
                        "t.area_id AS areaId, COALESCE(z.area_name, CONCAT('Khu #', t.area_id)) AS areaName, " +
                        "t.room_id AS roomId, COALESCE(r.name, CONCAT('Phong #', t.room_id)) AS roomName, " +
                        "t.note AS note, t.created_by AS createdBy, t.created_at AS createdAt, " +
                        "i.item_id AS itemId, i.food_name AS foodName, i.food_type AS foodType, " +
                        "i.box_type_id AS boxTypeId, bt.name AS boxTypeName, " +
                        "bt.length_m AS boxLengthM, bt.width_m AS boxWidthM, bt.height_m AS boxHeightM, " +
                        "i.box_count AS boxCount, i.unit_volume AS unitVolume, i.total_volume AS totalVolume " +
                "FROM inventory_transaction t " +
                "JOIN inventory_transaction_item i ON i.transaction_id = t.transaction_id " +
                "LEFT JOIN box_type bt ON bt.box_type_id = i.box_type_id " +
                "LEFT JOIN storage_zone z ON z.area_id = t.area_id " +
                "LEFT JOIN storage_room r ON r.room_id = t.room_id " +
                "WHERE 1 = 1 "
        );
        if (!"ALL".equals(normalizedType)) {
            sql.append("AND t.transaction_type = :type ");
        }
        if (areaId != null) {
            sql.append("AND t.area_id = :areaId ");
        }
        if (roomId != null) {
            sql.append("AND t.room_id = :roomId ");
        }
        if (!q.isEmpty()) {
            sql.append(
                "AND (" +
                    "LOWER(COALESCE(t.note, '')) LIKE :qLike OR " +
                    "LOWER(COALESCE(i.food_name, '')) LIKE :qLike OR " +
                    "LOWER(COALESCE(bt.name, '')) LIKE :qLike OR " +
                    "LOWER(COALESCE(r.name, '')) LIKE :qLike OR " +
                    "LOWER(COALESCE(z.area_name, '')) LIKE :qLike) "
            );
        }
        sql.append("ORDER BY t.created_at DESC, t.transaction_id DESC, i.item_id ASC");

        var queryObj = em.createNativeQuery(sql.toString());
        if (!"ALL".equals(normalizedType)) {
            queryObj.setParameter("type", normalizedType);
        }
        if (areaId != null) {
            queryObj.setParameter("areaId", areaId);
        }
        if (roomId != null) {
            queryObj.setParameter("roomId", roomId);
        }
        if (!q.isEmpty()) {
            queryObj.setParameter("qLike", qLike);
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = queryObj.unwrap(org.hibernate.query.NativeQuery.class)
                .setTupleTransformer((tuple, aliases) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    for (int i = 0; i < aliases.length; i++) {
                        map.put(aliases[i], tuple[i]);
                    }
                    return map;
                })
                .getResultList();

        Map<Integer, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Integer transactionId = intValue(rowValue(row, "transactionId"));
            if (transactionId == null) continue;

            Map<String, Object> transaction = grouped.computeIfAbsent(transactionId, id -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("transactionId", transactionId);
                m.put("transactionType", rowValue(row, "transactionType"));
                m.put("areaId", rowValue(row, "areaId"));
                m.put("areaName", rowValue(row, "areaName"));
                m.put("roomId", rowValue(row, "roomId"));
                m.put("roomName", rowValue(row, "roomName"));
                m.put("note", rowValue(row, "note"));
                m.put("createdBy", rowValue(row, "createdBy"));
                m.put("createdAt", rowValue(row, "createdAt"));
                m.put("items", new ArrayList<Map<String, Object>>());
                return m;
            });

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) transaction.get("items");
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("itemId", rowValue(row, "itemId"));
            item.put("foodName", rowValue(row, "foodName"));
            item.put("foodType", rowValue(row, "foodType"));
            item.put("boxTypeId", rowValue(row, "boxTypeId"));
            item.put("boxTypeName", rowValue(row, "boxTypeName"));
            item.put("boxLengthM", rowValue(row, "boxLengthM"));
            item.put("boxWidthM", rowValue(row, "boxWidthM"));
            item.put("boxHeightM", rowValue(row, "boxHeightM"));
            item.put("boxCount", rowValue(row, "boxCount"));
            item.put("unitVolume", rowValue(row, "unitVolume"));
            item.put("totalVolume", rowValue(row, "totalVolume"));
            items.add(item);
        }

        return ResponseEntity.ok(grouped.values());
    }

    @GetMapping("/summary")
    public ResponseEntity<?> summary(@RequestParam(required = false) Integer areaId) {
        StringBuilder sql = new StringBuilder(
                "SELECT " +
                        "COALESCE(SUM(CASE WHEN t.transaction_type = 'IN' THEN i.box_count ELSE 0 END), 0) AS totalInBoxes, " +
                        "COALESCE(SUM(CASE WHEN t.transaction_type = 'OUT' THEN i.box_count ELSE 0 END), 0) AS totalOutBoxes, " +
                        "COALESCE(SUM(CASE WHEN t.transaction_type = 'IN' THEN i.total_volume ELSE 0 END), 0) AS totalInVolume, " +
                        "COALESCE(SUM(CASE WHEN t.transaction_type = 'OUT' THEN i.total_volume ELSE 0 END), 0) AS totalOutVolume " +
                "FROM inventory_transaction t " +
                "LEFT JOIN inventory_transaction_item i ON i.transaction_id = t.transaction_id "
        );
        if (areaId != null) {
            sql.append("WHERE t.area_id = :areaId");
        }

        var queryObj = em.createNativeQuery(sql.toString());
        if (areaId != null) {
            queryObj.setParameter("areaId", areaId);
        }

        Object[] row = (Object[]) queryObj.getSingleResult();

        // Khi không có giao dịch nào, query trả về row với toàn NULL
        if (row == null) {
            return ResponseEntity.ok(Map.of(
                    "totalInBoxes", BigDecimal.ZERO,
                    "totalOutBoxes", BigDecimal.ZERO,
                    "estimatedStockBoxes", BigDecimal.ZERO,
                    "totalInVolume", BigDecimal.ZERO,
                    "totalOutVolume", BigDecimal.ZERO,
                    "estimatedStockVolume", BigDecimal.ZERO
            ));
        }

        BigDecimal totalInBoxes  = decimalValue(row[0]);
        BigDecimal totalOutBoxes = decimalValue(row[1]);
        BigDecimal totalInVolume  = decimalValue(row[2]);
        BigDecimal totalOutVolume = decimalValue(row[3]);

        return ResponseEntity.ok(Map.of(
                "totalInBoxes", totalInBoxes,
                "totalOutBoxes", totalOutBoxes,
                "estimatedStockBoxes", totalInBoxes.subtract(totalOutBoxes),
                "totalInVolume", totalInVolume,
                "totalOutVolume", totalOutVolume,
                "estimatedStockVolume", totalInVolume.subtract(totalOutVolume)
        ));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        String type = normalizeType(String.valueOf(body.getOrDefault("transactionType", "")));
        if (type == null || "ALL".equals(type)) {
            return ResponseEntity.badRequest().body(Map.of("error", "transactionType must be IN or OUT"));
        }

        Integer areaId = intValue(body.get("areaId"));
        Integer roomId = intValue(body.get("roomId"));
        if (areaId == null || roomId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "areaId and roomId are required"));
        }

        StorageRoom room = roomRepo.findById(roomId).orElse(null);
        if (room == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room not found"));
        }

        if (!areaId.equals(room.getAreaId())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Room does not belong to selected area"));
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> itemRows = (List<Map<String, Object>>) body.get("items");
        if (itemRows == null || itemRows.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "items are required"));
        }

        List<InventoryTransactionItem> items = new ArrayList<>();
        Map<String, StockRequest> requestedStock = new HashMap<>();
        BigDecimal totalVolume = BigDecimal.ZERO;
        int totalBoxes = 0;

        for (Map<String, Object> itemRow : itemRows) {
            String foodName = stringValue(itemRow.get("foodName"));
            if (foodName == null || foodName.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "foodName is required for all items"));
            }

            Integer boxCount = intValue(itemRow.get("boxCount"));
            Integer boxTypeId = intValue(itemRow.get("boxTypeId"));
            if (boxCount == null || boxCount <= 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "boxCount must be > 0"));
            }
            if (boxTypeId == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "boxTypeId is required for all items"));
            }

            BoxType boxType = boxTypeRepo.findById(boxTypeId).orElse(null);
            if (boxType == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Box type not found"));
            }

            BigDecimal unitVolume = boxType.getVolumeM3().setScale(6, RoundingMode.HALF_UP);

            BigDecimal itemVolume = unitVolume.multiply(BigDecimal.valueOf(boxCount)).setScale(6, RoundingMode.HALF_UP);

            InventoryTransactionItem item = new InventoryTransactionItem();
            item.setFoodName(foodName);
            item.setFoodType(stringValue(itemRow.get("foodType")));
            item.setBoxTypeId(boxTypeId);
            item.setBoxCount(boxCount);
            item.setUnitVolume(unitVolume);
            item.setTotalVolume(itemVolume);
            items.add(item);

            if ("OUT".equals(type)) {
                String key = stockKey(foodName, item.getFoodType(), boxTypeId);
                StockRequest request = requestedStock.computeIfAbsent(
                        key,
                        ignored -> new StockRequest(foodName, item.getFoodType(), boxTypeId, boxType.getName())
                );
                request.boxCount += boxCount;
            }

            totalBoxes += boxCount;
            totalVolume = totalVolume.add(itemVolume);
        }

        if ("OUT".equals(type)) {
            for (StockRequest request : requestedStock.values()) {
                BigDecimal available = currentStockBoxes(roomId, request.foodName, request.foodType, request.boxTypeId);
                if (available.compareTo(BigDecimal.valueOf(request.boxCount)) < 0) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "error", "Not enough stock for export",
                            "foodName", request.foodName,
                            "boxTypeName", request.boxTypeName,
                            "availableBoxes", available,
                            "requestedBoxes", request.boxCount
                    ));
                }
            }
        }

        BigDecimal current = BigDecimal.valueOf(room.getCurrentVolume() == null ? 0d : room.getCurrentVolume());
        BigDecimal max = BigDecimal.valueOf(room.getMaxVolume() == null ? 0d : room.getMaxVolume());
        BigDecimal nextVolume = "IN".equals(type) ? current.add(totalVolume) : current.subtract(totalVolume);

        if (nextVolume.compareTo(BigDecimal.ZERO) < 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "Current volume cannot be negative after export"));
        }
        if (nextVolume.compareTo(max) > 0) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Room volume exceeded",
                    "maxVolume", max,
                    "requestedVolume", nextVolume
            ));
        }

        InventoryTransaction transaction = new InventoryTransaction();
        transaction.setTransactionType(type);
        transaction.setAreaId(areaId);
        transaction.setRoomId(roomId);
        transaction.setNote(stringValue(body.get("note")));
        transaction.setCreatedBy(securityUtils.currentUserId());
        transaction.setCreatedAt(LocalDateTime.now());
        transactionRepo.save(transaction);

        for (InventoryTransactionItem item : items) {
            item.setTransactionId(transaction.getTransactionId());
        }
        itemRepo.saveAll(items);

        BigDecimal roundedNextVolume = nextVolume.setScale(6, RoundingMode.HALF_UP);
        room.setCurrentVolume(roundedNextVolume.doubleValue());
        roomRepo.save(room);

        userLogService.log(
                securityUtils.currentUserId(),
                "INVENTORY_" + type,
                ("IN".equals(type) ? "Nhập" : "Xuất") + " hàng phòng " + room.getName() +
                        ", tổng thùng=" + totalBoxes + ", tổng thể tích=" + totalVolume + "m3"
        );

        return ResponseEntity.ok(Map.of(
                "transactionId", transaction.getTransactionId(),
                "transactionType", type,
                "createdAt", transaction.getCreatedAt(),
                "roomId", roomId,
                "areaId", areaId,
                "totalBoxes", totalBoxes,
                "totalVolume", totalVolume,
                "currentVolume", room.getCurrentVolume(),
                "maxVolume", room.getMaxVolume(),
                "remainingVolume", max.subtract(roundedNextVolume)
        ));
    }

    private BigDecimal currentStockBoxes(Integer roomId, String foodName, String foodType, Integer boxTypeId) {
        Object result = em.createNativeQuery(
                "SELECT COALESCE(SUM(CASE WHEN t.transaction_type = 'IN' THEN i.box_count ELSE -i.box_count END), 0) " +
                "FROM inventory_transaction t " +
                "JOIN inventory_transaction_item i ON i.transaction_id = t.transaction_id " +
                "WHERE t.room_id = :roomId " +
                "AND LOWER(i.food_name) = LOWER(:foodName) " +
                "AND COALESCE(i.food_type, '') = :foodType " +
                "AND i.box_type_id = :boxTypeId"
        )
                .setParameter("roomId", roomId)
                .setParameter("foodName", foodName)
                .setParameter("foodType", foodType == null ? "" : foodType)
                .setParameter("boxTypeId", boxTypeId)
                .getSingleResult();
        return decimalValue(result);
    }

    private String stockKey(String foodName, String foodType, Integer boxTypeId) {
        return foodName.trim().toLowerCase() + "|" + (foodType == null ? "" : foodType.trim().toLowerCase()) + "|" + boxTypeId;
    }

    private Object rowValue(Map<String, Object> row, String key) {
        if (row.containsKey(key)) return row.get(key);
        return row.get(key.toLowerCase());
    }

    private static class StockRequest {
        private final String foodName;
        private final String foodType;
        private final Integer boxTypeId;
        private final String boxTypeName;
        private int boxCount;

        private StockRequest(String foodName, String foodType, Integer boxTypeId, String boxTypeName) {
            this.foodName = foodName;
            this.foodType = foodType;
            this.boxTypeId = boxTypeId;
            this.boxTypeName = boxTypeName;
        }
    }

    private String normalizeType(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toUpperCase();
        if ("ALL".equals(value) || "IN".equals(value) || "OUT".equals(value)) return value;
        return null;
    }

    private Integer intValue(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(raw));
        } catch (Exception ex) {
            return null;
        }
    }

    private BigDecimal decimalValue(Object raw) {
        if (raw == null) return BigDecimal.ZERO;
        if (raw instanceof BigDecimal bd) return bd;
        if (raw instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(raw));
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
    }

    private String stringValue(Object raw) {
        if (raw == null) return null;
        String value = String.valueOf(raw).trim();
        return value.isEmpty() ? null : value;
    }
}
