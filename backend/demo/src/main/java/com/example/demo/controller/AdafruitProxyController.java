package com.example.demo.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

/**
 * Proxy Adafruit IO REST API để tránh CORS khi frontend gọi trực tiếp.
 * GET  /api/adafruit/feeds/{feedKey}/last  → last value của feed
 * POST /api/adafruit/feeds/{feedKey}       → publish giá trị mới
 */
@RestController
@RequestMapping("/api/adafruit")
@RequiredArgsConstructor
public class AdafruitProxyController {

    @Value("${adafruit.username}")
    private String username;

    @Value("${adafruit.key}")
    private String aioKey;

    private final RestTemplate restTemplate = new RestTemplate();

    private static final String BASE = "https://io.adafruit.com/api/v2";
    private static final String GROUP = "food-storage-control";

    @GetMapping("/feeds/{feedKey}/last")
    public ResponseEntity<?> getLast(@PathVariable String feedKey) {
        String url = BASE + "/" + username + "/feeds/" + GROUP + "." + feedKey + "/data/last";
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-AIO-Key", aioKey);
        try {
            ResponseEntity<Object> resp = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), Object.class);
            return ResponseEntity.ok(resp.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(502).body("Adafruit error: " + e.getMessage());
        }
    }

    @PostMapping("/feeds/{feedKey}")
    public ResponseEntity<?> publish(@PathVariable String feedKey, @RequestBody Object body) {
        String url = BASE + "/" + username + "/feeds/" + GROUP + "." + feedKey + "/data";
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-AIO-Key", aioKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            ResponseEntity<Object> resp = restTemplate.exchange(
                url, HttpMethod.POST, new HttpEntity<>(body, headers), Object.class);
            return ResponseEntity.ok(resp.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(502).body("Adafruit error: " + e.getMessage());
        }
    }
}
