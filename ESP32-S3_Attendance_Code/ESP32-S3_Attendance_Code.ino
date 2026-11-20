#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "EspUsbHost.h"

// ================= USER CONFIGURATION =================
const char* WIFI_SSID     = "TP-Link_D106";
const char* WIFI_PASSWORD = "29483181";

// Debian Server Attendance Endpoint:
const char* SERVER_URL    = "http://10.50.180.34:3000/api/logs";

#define LED_PIN 2 // Built-in LED on ESP32

// 5-second anti-duplicate debounce delay
const unsigned long COOLDOWN_MS = 3000;
// ======================================================

EspUsbHost usb;
String scannedCardBuffer = "";
volatile bool newCardReady = false;
String cardToSend = "";

// Debounce Tracking Variables
unsigned long lastTapTime = 0;
String lastTappedCard = "";

void sendCardToServer(String cardUid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Wi-Fi] Not connected. Attempting reconnect...");
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
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n--- ESP32-S3 RFID Attendance Reader Starting ---");

  // 1. Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi Connected!] ESP32 IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[Wi-Fi Warning] Could not connect immediately. Will retry in loop.");
  }

  delay(500);

  // 2. Setup USB Host for RFID Scanner on Left Port
  usb.onKeyboard([](const EspUsbHostKeyboardEvent &event) {
    if (event.pressed) {
      if (event.ascii == '\r' || event.ascii == '\n' || event.keycode == 0x28) {
        if (scannedCardBuffer.length() > 0 && !newCardReady) {
          cardToSend = scannedCardBuffer;
          newCardReady = true;
          scannedCardBuffer = "";
        }
      } else if (event.ascii >= ' ' && event.ascii <= '~') {
        scannedCardBuffer += (char)event.ascii;
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
  // Main thread safely handles the HTTP request:
  if (newCardReady) {
    unsigned long now = millis();

    // 5-second anti-duplicate debounce check
    if (cardToSend == lastTappedCard && (now - lastTapTime < COOLDOWN_MS)) {
      unsigned long remainingSec = (COOLDOWN_MS - (now - lastTapTime)) / 1000 + 1;
      Serial.printf("[COOLDOWN] Duplicate tap for card %s ignored (wait %lu s).\n", cardToSend.c_str(), remainingSec);

      // Fast double blink on LED to signal "ignored / wait"
      digitalWrite(LED_PIN, HIGH); delay(60); digitalWrite(LED_PIN, LOW); delay(60);
      digitalWrite(LED_PIN, HIGH); delay(60); digitalWrite(LED_PIN, LOW);
    } else {
      lastTappedCard = cardToSend;
      lastTapTime = now;
      Serial.println("\n[CARD TAPPED]: " + cardToSend);
      sendCardToServer(cardToSend);
    }

    newCardReady = false;
    cardToSend = "";
  }

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
  }

  delay(20);
}