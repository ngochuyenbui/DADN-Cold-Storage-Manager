package com.example.demo.controller;

import com.example.demo.entity.BoxType;
import com.example.demo.repository.BoxTypeRepository;
import com.example.demo.security.SecurityUtils;
import com.example.demo.service.UserLogService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/box-types")
@RequiredArgsConstructor
public class BoxTypeController {

    private final BoxTypeRepository boxTypeRepo;
    private final UserLogService userLogService;
    private final SecurityUtils securityUtils;

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(boxTypeRepo.findAll());
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        BoxType boxType = new BoxType();
        ResponseEntity<?> error = applyPayload(boxType, body, true);
        if (error != null) return error;

        if (boxTypeRepo.findByNameIgnoreCase(boxType.getName()).isPresent()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Box type name already exists"));
        }

        boxType.setCreatedAt(LocalDateTime.now());
        boxTypeRepo.save(boxType);
        userLogService.log(securityUtils.currentUserId(), "CREATE_BOX_TYPE",
                "Tao loai thung: " + boxType.getName());
        return ResponseEntity.ok(boxType);
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        BoxType boxType = boxTypeRepo.findById(id).orElse(null);
        if (boxType == null) return ResponseEntity.notFound().build();

        ResponseEntity<?> error = applyPayload(boxType, body, false);
        if (error != null) return error;

        var duplicate = boxTypeRepo.findByNameIgnoreCase(boxType.getName());
        if (duplicate.isPresent() && !duplicate.get().getBoxTypeId().equals(id)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Box type name already exists"));
        }

        boxTypeRepo.save(boxType);
        userLogService.log(securityUtils.currentUserId(), "UPDATE_BOX_TYPE",
                "Cap nhat loai thung: " + boxType.getName());
        return ResponseEntity.ok(boxType);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        BoxType boxType = boxTypeRepo.findById(id).orElse(null);
        if (boxType == null) return ResponseEntity.notFound().build();

        String name = boxType.getName();
        boxTypeRepo.deleteById(id);
        userLogService.log(securityUtils.currentUserId(), "DELETE_BOX_TYPE",
                "Xoa loai thung: " + name);
        return ResponseEntity.ok(Map.of("message", "Deleted box type"));
    }

    private ResponseEntity<?> applyPayload(BoxType boxType, Map<String, Object> body, boolean create) {
        String name = stringValue(body.get("name"));
        if (name != null) boxType.setName(name);
        if (create && (boxType.getName() == null || boxType.getName().isBlank())) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }

        if (body.containsKey("lengthM")) boxType.setLengthM(decimalValue(body.get("lengthM")));
        if (body.containsKey("widthM")) boxType.setWidthM(decimalValue(body.get("widthM")));
        if (body.containsKey("heightM")) boxType.setHeightM(decimalValue(body.get("heightM")));

        if (boxType.getLengthM() == null || boxType.getWidthM() == null || boxType.getHeightM() == null ||
                boxType.getLengthM().compareTo(BigDecimal.ZERO) <= 0 ||
                boxType.getWidthM().compareTo(BigDecimal.ZERO) <= 0 ||
                boxType.getHeightM().compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "lengthM, widthM and heightM must be > 0"));
        }

        boxType.setLengthM(boxType.getLengthM().setScale(3, RoundingMode.HALF_UP));
        boxType.setWidthM(boxType.getWidthM().setScale(3, RoundingMode.HALF_UP));
        boxType.setHeightM(boxType.getHeightM().setScale(3, RoundingMode.HALF_UP));
        boxType.setVolumeM3(
                boxType.getLengthM()
                        .multiply(boxType.getWidthM())
                        .multiply(boxType.getHeightM())
                        .setScale(6, RoundingMode.HALF_UP)
        );
        return null;
    }

    private BigDecimal decimalValue(Object raw) {
        if (raw == null) return null;
        if (raw instanceof BigDecimal bd) return bd;
        if (raw instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try {
            return new BigDecimal(String.valueOf(raw));
        } catch (Exception ex) {
            return null;
        }
    }

    private String stringValue(Object raw) {
        if (raw == null) return null;
        String value = String.valueOf(raw).trim();
        return value.isEmpty() ? null : value;
    }
}
