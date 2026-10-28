#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "EspUsbHost.h"

// ================= USER CONFIGURATION =================
const char* WIFI_SSID     = "ADD WIFI NETWORK HERE";
const char* WIFI_PASSWORD = "ADD WIFI PASSWORD HERE";

// Your Debian Server Attendance Endpoint:
const char* SERVER_URL    = "http://10.50.180.12:3000/api/logs";

#define LED_PIN 2 // Built-in LED on ESP32
// ======================================================

EspUsbHost usb;
String scannedCard = "";

void sendCardToServer(String cardUid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Wi-Fi] Not connected. Reconnecting...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Build JSON: {"unique_id": "2772005086"}
  StaticJsonDocument<128> doc;
  doc["unique_id"] = cardUid;
  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("[HTTP] Sending tap: " + requestBody);
  digitalWrite(LED_PIN, HIGH);

  int httpCode = http.POST(requestBody);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Server Response (%d): %s\n", httpCode, response.c_str());
  } else {
    Serial.printf("[HTTP ERROR] Failed to reach server: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  digitalWrite(LED_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 1. Connect to Office Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[Wi-Fi Connected!] ESP32 IP: " + WiFi.localIP().toString());

  // 2. Setup USB Host for RFID Scanner on Left Port
  usb.onKeyboard([](const EspUsbHostKeyboardEvent &event) {
    if (event.pressed) {
      if (event.ascii == '\r' || event.ascii == '\n' || event.keycode == 0x28) {
        if (scannedCard.length() > 0) {
          Serial.println("\n[CARD TAPPED]: " + scannedCard);
          sendCardToServer(scannedCard);
          scannedCard = "";
        }
      } else if (event.ascii >= ' ' && event.ascii <= '~') {
        scannedCard += (char)event.ascii;
      }
    }
  });

  if (!usb.begin()) {
    Serial.printf("USB Host Init Failed: %s\n", usb.lastErrorName());
  } else {
    Serial.println("Ready! Tap RFID card to test.");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
  }
  delay(10);
}