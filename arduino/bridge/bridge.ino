/*
 * ESP32-C3 to ESP32 ESP-NOW Bridge
 * Receives commands via USB serial from Pi
 * Relays them to main ESP32 via ESP-NOW
 */

#include <esp_now.h>
#include <WiFi.h>

// Main ESP32 MAC address (you'll need to update this)
// Default: AA:BB:CC:DD:EE:FF (change after getting MAC from main ESP32)
uint8_t mainESP32MAC[] = {0x1C, 0x69, 0x20, 0x30, 0x0A, 0xD8};

// Struct to match main ESP32
struct __attribute__((packed)) RobotCommand {
  uint8_t command_type;
  uint8_t target_id;
  uint16_t value;
  uint16_t duration;
};

void setup() {
  Serial.begin(9600); // Match Pi baud rate
  delay(1000);

  Serial.println("\n=== ESP32-C3 ESP-NOW Bridge ===");
  Serial.println("Initializing WiFi and ESP-NOW...");

  // Initialize WiFi in station mode (required for ESP-NOW)
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("ERROR: ESP-NOW initialization failed!");
    return;
  }

  Serial.println("ESP-NOW initialized");

  // Register the main ESP32 as peer
  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, mainESP32MAC, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("ERROR: Failed to add peer!");
    return;
  }

  Serial.print("Peer added: ");
  printMAC(mainESP32MAC);
  Serial.println("\nWaiting for commands from Pi on serial...");
}

void loop() {
  // Check for serial data from Pi
  if (Serial.available() >= 7) {
    uint8_t startByte = Serial.read();

    if (startByte == 0xA5) {
      // Valid start byte, read the command
      RobotCommand cmd;
      Serial.readBytes((char*)&cmd, sizeof(RobotCommand));

      Serial.printf("Received from Pi: Type=%d, ID=%d, Val=%d\n",
                    cmd.command_type, cmd.target_id, cmd.value);

      // Send via ESP-NOW to main ESP32
      esp_err_t result = esp_now_send(mainESP32MAC, (uint8_t*)&cmd, sizeof(RobotCommand));

      if (result == ESP_OK) {
        Serial.println("Sent to main ESP32 via ESP-NOW");
      } else {
        Serial.printf("ERROR: Failed to send via ESP-NOW (code: %d)\n", result);
      }
    }
  }

  delay(10);
}

void printMAC(uint8_t* mac) {
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 0x10) Serial.print("0");
    Serial.print(mac[i], HEX);
    if (i < 5) Serial.print(":");
  }
}
