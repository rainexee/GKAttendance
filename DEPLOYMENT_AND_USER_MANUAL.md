# GKAttendance — Complete Deployment & User Manual

> **Welcome!** If you are a new intern, lab assistant, or developer taking over this project, this manual was written specifically for you. It explains how the entire system works from end to end, and provides an easy, copy-paste guide to deploy and run it 24/7 on an on-premise Debian server.

---

## Table of Contents
1. [The Big Picture: How the System Works](#1-the-big-picture-how-the-system-works)
2. [Hardware & Software Architecture](#2-hardware--software-architecture)
3. [Step-by-Step Debian Server Deployment](#3-step-by-step-debian-server-deployment)
   - [Step 3.1: Keep Debian Awake 24/7](#step-31-keep-debian-awake-247)
   - [Step 3.2: Install Node.js & MariaDB](#step-32-install-nodejs--mariadb)
   - [Step 3.3: Set Up the Database](#step-33-set-up-the-database)
   - [Step 3.4: Download the Project & Install Dependencies](#step-34-download-the-project--install-dependencies)
   - [Step 3.5: Run the Server 24/7 with PM2](#step-35-run-the-server-247-with-pm2)
4. [Step-by-Step ESP32-S3 Scanner Setup](#4-step-by-step-esp32-s3-scanner-setup)
   - [Step 4.1: Hardware Wiring & Ports](#step-41-hardware-wiring--ports)
   - [Step 4.2: Arduino IDE Configuration](#step-42-arduino-ide-configuration)
   - [Step 4.3: Flashing the Firmware](#step-43-flashing-the-firmware)
5. [How to Use the Web System](#5-how-to-use-the-web-system)
   - [5.1 Admin Portal Guide](#51-admin-portal-guide)
   - [5.2 Registering & Editing User RFID Cards](#52-registering--editing-user-rfid-cards)
   - [5.3 Removing a User](#53-removing-a-user)
   - [5.4 Dynamic Event Calendar & Scheduling](#54-dynamic-event-calendar--scheduling)
   - [5.5 User Self-Service Portal](#55-user-self-service-portal)
   - [5.6 Two-Way CSV Auto-Sync (`users.csv`)](#56-two-way-csv-auto-sync-userscsv)
6. [Accessing from the Internet (Cloudflare & Ngrok)](#6-accessing-from-the-internet-cloudflare--ngrok)
7. [Cheat Sheet & Troubleshooting](#7-cheat-sheet--troubleshooting)

---

## 1. The Big Picture: How the System Works

GKAttendance is an automated physical access and attendance tracking system designed for university laboratories and office doors.

```
 [Student / Staff ID]
          │
          ▼ (Physical Tap)
 [USB RFID Reader]
          │ (Keystrokes / USB HID)
          ▼
 [ESP32-S3 Microcontroller] (Outside Door)
          │
          ▼ (HTTP POST /api/logs over Wi-Fi)
 [Debian Server:3000] (Runs 24/7 in Switch User state)
          │
          ├──► MariaDB (Checks last log: Toggles LOGIN <-> LOGOUT)
          ├──► users.csv (Auto-syncs changes to disk)
          └──► Web Dashboard (Shows live avatar, attendance stats, & calendar)
```

### The Tap Lifecycle:
1. **Physical Tap:** A student or teacher taps their RFID card on the scanner outside the office door.
2. **Scanner Read:** The USB RFID reader acts as a USB keyboard and types the card's 10-digit number into the ESP32's native USB host port.
3. **Wi-Fi Transmission:** The ESP32 sends a lightweight JSON packet (`{"unique_id": "2772005086"}`) to `http://<SERVER_IP>:3000/api/logs`.
4. **Debounce Check:** If the same card is tapped again within **3 seconds**, both the ESP32 and the server safely ignore it to prevent accidental "double logins" or instant logouts.
5. **Database Processing:**
   - The server queries MariaDB for the user matching that RFID card UID.
   - If found: it checks their last recorded status. If they were logged out, it records **`LOGIN`**. If they were logged in, it records **`LOGOUT`**.
   - If not found: it returns `404 Unregistered Card`.
6. **Live Reaction:** The Admin Dashboard screen updates immediately, showing the user's name, ID number, role, lab group, and a green (LOGIN) or red (LOGOUT) badge.

---

## 2. Hardware & Software Architecture

### Hardware:
- **Server:** Any desktop PC running Debian Linux (connected to the local network via Ethernet or stable Wi-Fi).
- **Microcontrollers (5 units):** **ESP32-S3-N16R8** development boards with dual USB-C ports.
- **Card Scanners (5 units):** Standard 13.56MHz or 125kHz USB HID Keyboard-Wedge RFID scanners (or RC522).

### Software Stack:
- **Operating System:** Debian Linux 11 or 12 (Bullseye / Bookworm).
- **Backend:** Node.js (v18 or v20 LTS) + Express.js.
- **Database:** MariaDB Server 10.x / 11.x.
- **Process Manager:** PM2 (ensures the server starts on boot and restarts automatically if it crashes).
- **Frontend:** Vanilla HTML5, CSS3, modern JavaScript (no heavy build tools or frameworks needed).

---

## 3. Step-by-Step Debian Server Deployment

Follow these steps sequentially on the Debian machine to set up the system from scratch.

### Step 3.1: Keep Debian Awake 24/7
Because this server operates 24/7 while staying in the **"Switch User"** or lock screen state, we must prevent Debian from suspending or killing user processes.

Open the terminal on Debian and run:

```bash
# 1. Mask sleep, suspend, and hibernation targets
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# 2. Enable user lingering so background services keep running when switched/locked
sudo loginctl enable-linger $USER
```

---

### Step 3.2: Install Node.js & MariaDB

```bash
# 1. Update system packages
sudo apt update && sudo apt upgrade -y

# 2. Install curl, git, and build tools
sudo apt install -y curl git ufw

# 3. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Verify Node.js and npm versions
node -v   # Should output v20.x.x
npm -v    # Should output 10.x.x

# 5. Install MariaDB Server
sudo apt install -y mariadb-server
sudo systemctl enable mariadb
sudo systemctl start mariadb
```

---

### Step 3.3: Set Up the Database

1. Open the MariaDB root shell:
   ```bash
   sudo mariadb
   ```

2. Run the following SQL block (you can copy and paste the entire block):
   ```sql
   -- Create Database
   CREATE DATABASE IF NOT EXISTS GKAttendance;
   USE GKAttendance;

   -- Create Low-Priority Database User used by Node.js backend
   CREATE USER IF NOT EXISTS 'GKAttendance_LowPriority'@'localhost' IDENTIFIED BY 'n0root4u!';
   GRANT ALL PRIVILEGES ON GKAttendance.* TO 'GKAttendance_LowPriority'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

3. Import the official database schema:
   ```bash
   # If you cloned the repository or have the Schema folder:
   sudo mariadb GKAttendance < /path/to/GKAttendance/Schema/GKAttendance.sql
   ```
   *(This automatically creates the `Person`, `ID`, `Role`, `GKLab`, `Logging`, `Calendar`, and `EventAssignments` tables, and seeds the default admin account: username `admin`, password `admin123`).*

---

### Step 3.4: Download the Project & Install Dependencies

#### Option A: Clone from GitHub (Recommended)
```bash
cd ~
git clone https://github.com/rainexee/GKAttendance.git
cd GKAttendance/backend
npm install
```

#### Option B: From Offline Export Zip
```bash
cd ~
unzip GKAttendance_Export.zip -d GKAttendance
cd GKAttendance/backend
npm install
```

---

### Step 3.5: Run the Server 24/7 with PM2

We use **PM2** so that the application starts automatically when the computer boots up, runs silently in the background, and restarts instantly if any error occurs.

```bash
# 1. Install PM2 globally
sudo npm install -g pm2

# 2. Navigate to the backend folder
cd ~/GKAttendance/backend

# 3. Start the application with PM2
pm2 start server.js --name "gk-attendance"

# 4. Configure PM2 to automatically launch on system boot
pm2 startup
# (PM2 will display a command starting with 'sudo env PATH=...' — copy and run that exact line!)

# 5. Save the running process list
pm2 save

# 6. Allow port 3000 through the firewall
sudo ufw allow 3000/tcp
```

### Checking Server Health:
- View live logs: `pm2 logs gk-attendance`
- View CPU / Memory status: `pm2 status`
- Restart application: `pm2 restart gk-attendance`

### Find Your Server's IP Address:
Run:
```bash
hostname -I
```
*(Look for your local IP, e.g., `10.50.180.34`).*

Now, open any web browser on the same Wi-Fi and navigate to:
**`http://10.50.180.34:3000/dashboard`**

---

## 4. Step-by-Step ESP32-S3 Scanner Setup

Each of the 5 door stations uses an **ESP32-S3-N16R8** development board.

### Step 4.1: Hardware Wiring & Ports

The ESP32-S3 board has **TWO USB-C ports**:

```
 ┌────────────────────────────────────────────────────────┐
 │                      ESP32-S3 BOARD                    │
 │                                                        │
 │   [LEFT USB-C PORT]                 [RIGHT USB-C PORT] │
 │    (Native USB OTG)                   (CH340 Serial)   │
 └──────────┬───────────────────────────────────┬─────────┘
            │                                   │
            ▼                                   ▼
 [USB RFID Card Scanner]              [5V Power / PC USB]
```

- **Right USB-C Port (CH340 Serial/UART):** Plug this into your computer for flashing the code, or into a standard 5V USB wall charger to power the board outside the door.
- **Left USB-C Port (Native USB OTG):** Plug the **USB RFID Scanner** directly into this port using a USB-A to USB-C OTG adapter.

---

### Step 4.2: Arduino IDE Configuration

1. Install **Arduino IDE 2.x** on your laptop.
2. In Arduino IDE, open **Tools > Board > Boards Manager...**, search for `esp32` by Espressif, and ensure version **3.0.0 or higher** is installed.
3. In **Sketch > Include Library > Manage Libraries...**, search and install:
   - **`EspUsbHost`** (by tanakamasayuki)
   - **`ArduinoJson`** (by Benoît Blanchon)
4. Plug the ESP32's **Right USB-C Port** into your computer and set these exact options under the **Tools** menu:

| Menu Item | Setting | Why |
| :--- | :--- | :--- |
| **Board** | **`ESP32S3 Dev Module`** | Standard ESP32-S3 board definition. |
| **Port** | Select your board's COM port (e.g., `COM28` on Windows, `/dev/ttyUSB0` on Linux) | Connected to CH340 programming port. |
| **USB CDC On Boot** | **`Disabled`** ⚠️ *(Crucial)* | Frees the Left native USB port completely for reading the RFID scanner without conflict. |
| **USB Mode** | **`Hardware CDC and JTAG`** | Standard mode for dual-port S3 boards. |
| **Flash Size** | **`16MB (128Mb)`** | Matches N16 flash memory. |
| **PSRAM** | **`OPI PSRAM`** | Matches R8 8MB Octal PSRAM. |
| **Upload Speed** | **`921600`** | Fast and stable flashing speed. |

---

### Step 4.3: Flashing the Firmware

Open the sketch located at:
`ESP32-S3_Attendance_Code/ESP32-S3_Attendance_Code.ino`

1. Update the **User Configuration** block at the top with your local Wi-Fi credentials and Debian server IP:
   ```cpp
   // ================= USER CONFIGURATION =================
   const char* WIFI_SSID     = "Your_Office_WiFi_Name";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";

   // Debian Server Attendance Endpoint:
   const char* SERVER_URL    = "http://10.50.180.34:3000/api/logs";

   #define LED_PIN 2 // Built-in LED on ESP32

   // 3-second anti-duplicate debounce delay
   const unsigned long COOLDOWN_MS = 3000;
   // ======================================================
   ```

2. Click the **Upload (Arrow)** button in Arduino IDE.
3. Once upload finishes, open the **Serial Monitor** at **`115200 baud`**.
4. You will see:
   ```text
   Connecting to Wi-Fi.....
   [Wi-Fi Connected!] ESP32 IP: 192.168.1.150
   Ready! Tap RFID card to test.
   ```
5. Tap an RFID card on the scanner:
   ```text
   [CARD TAPPED]: 2772005086
   [HTTP] Sending tap: {"unique_id":"2772005086"}
   [HTTP] Server Response (200): {"success":true,"status":"LOGIN",...}
   ```
   *(If you double-tap within 3 seconds, it will print: `[COOLDOWN] Duplicate tap for card 2772005086 ignored (wait 2 s)` and flash the LED twice!)*

---

## 5. How to Use the Web System

### 5.1 Admin Portal Guide
- URL: `http://<SERVER_IP>:3000/dashboard`
- Default Login: Username: `admin` | Password: `admin123`

The dashboard features **4 main panels** in the left sidebar:
1. **Registered People:** View all registered staff and students, their card UID, role, and lab.
2. **Card Input / Scan Logs:** Complete historical table of every tap (Name, DLSU ID, Status, Timestamp). Includes an **"Export Logs"** button for Excel/CSV reports.
3. **Card Scanner:** Real-time visual tap screen. When someone taps outside the door, this screen immediately lights up green or red with their profile photo/info.
4. **Calendar & Scheduling:** Dynamic event creation, attendance assignment, and schedule list.

---

### 5.2 Registering & Editing User RFID Cards

#### Method 1: Using the Edit Modal in Dashboard
1. Go to **Registered People**.
2. Find the user and click **`Edit`** (or click their **Card UID badge** directly).
3. The **Edit User & RFID Card** modal opens.
4. **Tap the physical RFID card** on your scanner (or type the card number in the **RFID Card UID** field).
5. Click **Save Changes**. The card is now immediately linked to that user!

#### Method 2: One-Click Quick Assignment from Scanner Screen
1. Go to the **Card Scanner** tab.
2. Tap a new, unregistered card on the scanner.
3. The screen will display:
   > **✗ Unregistered Card! Please register this card first. (Card: `2772005086`)**  
   > `[Assign this Card UID to a User]`
4. Click **`Assign this Card UID to a User`**.
5. Type the user's name or DLSU ID. The edit modal opens with that card UID already filled in! Click **Save**.

---

### 5.3 Removing a User
1. In **Registered People**, click the red **`Remove`** button next to any user.
2. Confirm the prompt.
3. The system executes a safe cascade deletion:
   - Removes user profile
   - Removes all their calendar event assignments
   - Removes all their scan logs
   - **Frees up their physical RFID card in the database** so the card can be reassigned to someone else later!

---

### 5.4 Dynamic Event Calendar & Scheduling
- **Create Event:** Click **`Create Dynamic Event`**, enter Title, Location, and Start/End times.
- **Assign Users:** Under **Selecting Users**, check off the people who should attend, and click **Save Assigned Users**.
- **Live Attendees:** Click on any event on the calendar to see the attendee list, see who joined, or remove attendees.

---

### 5.5 User Self-Service Portal
- URL: `http://<SERVER_IP>:3000/userdashboard`
- Users log in with their personal username and password.
- Features:
  - View personal attendance history.
  - View lab calendar and events.
  - **Join / Leave Events:** Users can self-register for workshops or shifts by clicking **Join Event**, and withdraw anytime by clicking **Leave Event**.

---

### 5.6 Two-Way CSV Auto-Sync (`users.csv`)
In the root directory of the project, there is a file named **`users.csv`**:
- Any user created or edited in the web interface is automatically exported to `users.csv`.
- If you open `users.csv` in Excel, edit names or add rows, and save the file, the server's internal file-watcher detects the change and **automatically syncs the updates back into MariaDB** within 1 second!

---

## 6. Accessing from the Internet (Cloudflare & Ngrok)

If you need the attendance dashboard accessible outside the school building (e.g., via `https://cite4d.com`):

### Why Cloudflare Tunnel (`cloudflared`) might fail on campus networks:
Cloudflare Tunnel strictly requires outbound access on **port 7844**. Many university/campus firewalls block all non-standard ports (including port 7844).

### The Solution: Use `ngrok` (Runs over standard Port 443)

1. Install ngrok on Debian:
   ```bash
   curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
   echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
   sudo apt update && sudo apt install -y ngrok
   ```

2. Add your free auth token from [ngrok.com](https://ngrok.com):
   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>
   ```

3. Start the tunnel:
   ```bash
   ngrok http 3000
   ```
   *(It will provide a secure public URL like `https://xxxx.ngrok-free.app` that works anywhere).*

4. **Connect to your custom domain (`cite4d.com`):**
   In your **Cloudflare DNS Dashboard** for `cite4d.com`, add a **CNAME** record:
   - **Type:** `CNAME`
   - **Name:** `attendance` (or `@`)
   - **Target:** `xxxx.ngrok-free.app`
   - **Proxy status:** Proxied (Orange cloud)

---

## 7. Cheat Sheet & Troubleshooting

### Daily Operations Cheat Sheet:

| Task | Command / Action |
| :--- | :--- |
| **Check server status** | `pm2 status` |
| **View live server logs** | `pm2 logs gk-attendance` |
| **Restart the server** | `pm2 restart gk-attendance` |
| **Pull latest updates** | `git pull origin master && pm2 restart all` |
| **Find Server IP** | `hostname -I` |
| **MariaDB console** | `sudo mariadb GKAttendance` |

---

### Common Issues & Quick Fixes:

#### 1. "ESP32 crashes or reboots when card is tapped (`rst:0x3`)"
- **Cause:** Calling heavy HTTP requests inside the USB Host callback.
- **Fix:** Use the updated firmware in `ESP32-S3_Attendance_Code/`. It moves the HTTP request to the main `loop()`.

#### 2. "Serial Monitor displays garbled text (`R~BcRSgB`)"
- **Cause:** Baud rate mismatch.
- **Fix:** In Arduino Serial Monitor, change the dropdown in the bottom-right corner to **`115200 baud`**.

#### 3. "Dashboard shows 'Loading registered users...' and won't finish"
- **Cause:** Browser cache has old JavaScript files.
- **Fix:** Press **Ctrl + Shift + R** (or **Ctrl + F5**) in your browser to force a clean cache reload.

#### 4. "Database access denied for GKAttendance_LowPriority"
- **Fix:** Run this in MariaDB:
  ```sql
  GRANT ALL PRIVILEGES ON GKAttendance.* TO 'GKAttendance_LowPriority'@'localhost';
  FLUSH PRIVILEGES;
  ```

#### 5. "Double-tap logs 'LOGIN LOGIN' back to back"
- **Cause:** Cooldown delay not enabled.
- **Fix:** The firmware and server both have a **3-second debounce cooldown** built-in. Make sure both are running the latest code from the `master` branch.

---

*Manual maintained by the GKAttendance Development Team.*
