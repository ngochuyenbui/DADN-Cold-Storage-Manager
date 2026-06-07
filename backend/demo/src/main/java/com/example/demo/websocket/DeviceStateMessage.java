package com.example.demo.websocket;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class DeviceStateMessage {
    private String feed;      // "temp-fan", "humi-fan", "mode", "temp-threshold", "humi-threshold"
    private String value;
    private String timestamp;
    private int roomId;       // phòng liên quan
}
