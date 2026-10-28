# GKAttendance — Simple Setup & Documentation Guide (For Interns)

> 💡 **What is this project?**  
> An automatic attendance system for our 5 office doors on the 4th floor.  
> When a person taps their ID outside a door, a small microcontroller (ESP32) sends the card number over Wi-Fi to our central Debian server, which automatically logs them **IN** or **OUT** in the database.

---

## 1. How the Whole System Works (In Plain English)

```
[1. Person taps ID] ──► [2. USB Scanner reads card] ──► [3. ESP32 sends Wi-Fi signal]
                                                                  │
                                                                  ▼
[5. Admin Screen updates live] ◄── [4. Debian Server saves IN/OUT in MariaDB]
```

There are only **two main parts** to understand:
1. **The Door Unit:** An ESP32 microcontroller + RFID card scanner mounted outside each office door.
2. **The Server:** A Debian computer running in the office that stores the database and runs the web dashboards.

---

## 2. The Door Unit (ESP32 + RFID Scanner)

### 🔌 Physical Wiring & Ports
Look at the ESP32-S3 board with its two USB-C ports at the bottom:

```
  ┌─────────────────────────┐
  │         ESP32-S3        │
  │                         │
  │   [LEFT]       [RIGHT]  │
  └─────┬─────────────┬─────┘
        │             │
        ▼             ▼
  RFID Scanner   Power Cable
  (USB Adapter)  (From Wall Charger or PC)
```

- **Right Port:** Connect to a standard 5V USB phone charger on the wall (or your computer when flashing code).
- **Left Port:** Connect the USB RFID Scanner using the USB-to-USB-C adapter.
- *(Check: The light on the RFID scanner must turn on).*

---

### 💻 Arduino IDE Settings
Before clicking Upload in the Arduino IDE, set these in the **Tools** menu:

| Menu Item | Set To |
|---|---|
| **Board** | `ESP32S3 Dev Module` |
| **USB CDC On Boot** | **`Disabled`** ⚠️ *(Must be Disabled!)* |
| **PSRAM** | **`OPI PSRAM`** |
| **Flash Size** | **`16MB (128Mb)`** |
| **Port** | The COM port of your Right USB port |

---

### 📄 ESP32 Code (Copy & Paste)
Install the **`EspUsbHost`** library in Arduino IDE (Tools > Manage Libraries), then paste this code:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include "EspUsbHost.h"

// 1. Put your office Wi-Fi details here:
const char* WIFI_SSID     = "YOUR_OFFICE_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// 2. Put the Debian server's IP address here:
const char* SERVER_URL    = "http://10.50.180.12:3000/api/logs";

EspUsbHost usb;
String scannedCard = "";

void sendCardToServer(String cardUid) {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Send card to server
  String requestBody = "{\"unique_id\":\"" + cardUid + "\"}";
  int httpCode = http.POST(requestBody);
  http.end();
}

void setup() {
  Serial.begin(115200);

  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  // Listen to the USB scanner on the Left port
  usb.onKeyboard([](const EspUsbHostKeyboardEvent &event) {
    if (event.pressed) {
      if (event.ascii == '\r' || event.ascii == '\n' || event.keycode == 0x28) {
        if (scannedCard.length() > 0) {
          sendCardToServer(scannedCard);
          scannedCard = "";
        }
      } else if (event.ascii >= ' ' && event.ascii <= '~') {
        scannedCard += (char)event.ascii;
      }
    }
  });

  usb.begin();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(5000);
  }
  delay(10);
}
```

---

## 3. The Debian Server Setup

The server runs on **Debian** and stays on the **"Switch User"** screen 24/7.

### Step 1: Tell Debian Never to Sleep
Open the terminal on Debian and paste these commands so the server never turns off its network card when sitting idle:

```bash
# 1. Prevent PC from sleeping/suspending
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# 2. Allow programs to keep running even if you switch user or log out
sudo loginctl enable-linger $USER

# 3. Open port 3000 so the ESP32 can connect
sudo ufw allow 3000/tcp
```

---

### Step 2: Start the Database (MariaDB)
```bash
# Start the database service
sudo systemctl enable --now mariadb

# Grant permissions to the attendance user
sudo mariadb -e "GRANT ALL PRIVILEGES ON GKAttendance.* TO 'GKAttendance_LowPriority'@'localhost'; FLUSH PRIVILEGES;"
```

---

### Step 3: Start the Attendance System with PM2
PM2 is a tool that keeps the system running in the background and restarts it automatically if the computer ever reboots.

```bash
cd ~/Documents/GKAttendance/backend

# Start the system
pm2 start server.js --name "gk-attendance"

# Make PM2 restart automatically on computer reboot
pm2 startup
# (Copy and run the command PM2 prints on your screen)

# Save the current state
pm2 save
```

To verify it is running:
```bash
pm2 status
```
*(Status should say **`online`** in green).*

---

## 4. How to Register Users & RFID Cards

### Adding Users via `users.csv`
1. Open the file `users.csv` in the project folder.
2. Add a new row for each person:
   ```csv
   dlsu_idnumber,full_name,username,email,role,lab
   12208127,Jericho Raymund,Jericho Lirio,jericho_lirio@dlsu.edu.ph,Student,Cite4D
   ```
3. **What is their default password?**
   - Their default password is **always their DLSU ID number** (e.g. `12208127`).
   - When they log in for the first time, the website forces them to create their own new password.

---

### Linking a Physical RFID Card to a Person
When a user gets a new ID card or keyfob, link their card number to their account using this 1-line command on Debian:

```bash
sudo mariadb -e "
USE GKAttendance;
INSERT INTO ID (unique_id, dlsu_idnumber) VALUES ('2772005086', 12208127)
ON DUPLICATE KEY UPDATE dlsu_idnumber = 12208127;
UPDATE Person SET unique_id = '2772005086' WHERE dlsu_idnumber = 12208127;
"
```
*(Replace `2772005086` with their card number, and `12208127` with their DLSU ID).*

---

## 5. Web Portals & URLs

Any computer, laptop, or phone connected to the office Wi-Fi can open these in a web browser:

- **Admin Portal:** `http://10.50.180.12:3000/dashboard`
  - **Card Scanner Tab:** Live screen that lights up **Green (`LOGIN`)** or **Red (`LOGOUT`)** every time someone taps outside.
  - **Card Scan Logs Tab:** Shows full history of who came in and out with timestamps.
  - **Setting Schedules & Events:** Create dynamic events and view attendee lists.
- **User Portal:** `http://10.50.180.12:3000/userdashboard`
  - Allows students and staff to sign up (Join/Leave) for events on the calendar.
- **Login Page:** `http://10.50.180.12:3000/login`

---

## 6. Intern Cheatsheet: What to Do If Something Breaks

| Problem | Cause | Quick Fix (1-Minute Solution) |
|---|---|---|
| **`Connection refused` on ESP32** | Debian firewall is blocking port 3000. | On Debian, run: `sudo ufw allow 3000/tcp`. |
| **Scanner LED is not turning on** | No power reaching the scanner. | Check that power cable is in the **Right port** and scanner is in the **Left port**. |
| **ESP32 bootlooping / restarting** | Wrong setting in Arduino IDE. | Set **Tools > USB CDC On Boot** to **`Disabled`** and **PSRAM** to **`OPI PSRAM`**, then re-upload. |
| **Card tapped but screen doesn't react** | Card is not registered in the database yet. | Register the card using Section 4 above. |
| **Server stopped after computer reboot** | PM2 was not saved. | Run `cd ~/Documents/GKAttendance/backend && pm2 start server.js --name "gk-attendance" && pm2 save`. |
| **Serial Monitor prints strange symbols `□□□`** | Wrong baud rate. | Change bottom-right dropdown in Serial Monitor to **`115200 baud`**. |
