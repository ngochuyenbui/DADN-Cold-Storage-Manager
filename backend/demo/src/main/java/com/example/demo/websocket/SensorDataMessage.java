package com.example.demo.websocket;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SensorDataMessage {
    private String feed;      // "temp" | "humi"
    private double value;
    private String timestamp;
    private int roomId;       // phòng nào gửi dữ liệu (r1=1, r2=2, ...)
}
