# 🐔 Chick-fil-A Catering Fulfillment & Kitchen Display System (KDS)

A purpose-built real-time catering operations portal designed specifically for Chick-fil-A catering coordinators and kitchen staff.

---

## 💡 The Problem This Solves
When customers call in randomly with last-minute additions—such as **"Can we add 50 BBQ sauces?"**, extra gallons of tea, or gluten-free requests—coordinators often post to Slack. In a busy kitchen lunch rush, Slack messages get scrolled past, forgotten, or never documented into the final fulfillment prep, leading to missing items at pickup and frantic scrambles.

**This portal replaces manual Slack messages with an automated, real-time Kitchen Display System (KDS):**
1. **The Coordinator (Wife)** can open any order and tap **"⚡ Add Item / Flash Kitchen"** or choose 1-click presets (e.g., `+50 BBQ Sauces`).
2. **The Kitchen Screen** immediately **flashes bright pulsing red**, sounds an audible alert chime, highlights the added item, and puts up a giant banner: `⚡ ADDED: 50x Barbeque Sauce Packets`.
3. **The Kitchen Chef** taps `[ ✓ TAP TO ACKNOWLEDGE ]` on their touchscreen to silence the flashing and confirm receipt.
4. **Touch Checklist:** Kitchen staff tap each item directly on screen to mark it `✓ Packed & Verified`, guaranteeing nothing is forgotten.
5. **Real-time Status Sync:** The coordinator sees live updates without refreshing (e.g. *"Kitchen acknowledged update"*, *"4 of 4 items packed"*).

---

## 🚀 Quick Start

### 1. Launch the Portal
Double-click `start.bat` (or run `./start.ps1` in PowerShell).

The server will start and automatically open your default browser at:
`http://localhost:3000`

### 2. Open Kitchen Display on a Touchscreen / Tablet
Any iPad, Android tablet, POS terminal, or monitor on the same local Wi-Fi network can open:
`http://<YOUR-LOCAL-IP>:3000?view=kitchen`

*(The exact IP address is printed in the server console and displayed on the banner at the top of the screen).*

---

## 📱 Feature Overview

### 📋 1. Order Desk (Coordinator / Front-of-House View)
- **Fast Catering Order Booking:** Customer name, contact info, organization, guest count, pickup/delivery time, special allergen notes, and pre-loaded Chick-fil-A catering trays (Nugget Trays, Chick-n-Strips, Cool Wraps, Mac & Cheese, Gallons, Sauces).
- **⚡ Emergency Modification Modal (Phone Call Additions):**
  - **1-Click Sauce Presets:** `+50 BBQ Sauces`, `+50 CFA Sauces`, `+25 Polynesian`, `+2 Gallons Sweet Tea`, `+1 Bag Pellet Ice`, etc.
  - **Urgency Switch:** Toggle `🚨 FLASH KITCHEN DISPLAY RED & RING CHIME`.
  - **Custom Notes:** Attach quick caller notes (*"Customer called at 2:15 PM, pack sauces in separate brown bag"*).
- **Live Sync Indicator:** Displays green pulsing dot showing active real-time connection to the kitchen.
- **Order Audit Trail:** View timestamped logs of every action taken on an order (booking time, modification time, chef acknowledgment, and packing verification).

### 🍳 2. Kitchen Fulfillment Display (KDS Touchscreen Mode)
- **High-Contrast Touchscreen Layout:** Optimized for 10"–24" displays with dark mode and large touch targets (50px+) that work easily with gloved hands.
- **🚨 Animated Flashing Red Alert System:**
  - Order card border and header pulse with high-intensity red warning animations.
  - Newly added items have pulsating red background highlights (`⚡ NEW ADDITION`).
  - Synthesizes a pleasant two-tone kitchen notification chime via HTML5 Web Audio API (no external MP3 files needed; can be muted/unmuted with 1 tap).
- **Touch Checklist & Verification:**
  - Kitchen staff tap anywhere on an item row or checkbox to mark it `✓ Packed`.
  - Strikethrough effect and green badge displaying `Packed by Kitchen Chef`.
  - Live progress bar showing fulfillment percentage (`4/5 items packed - 80%`).
- **Touch Acknowledgment:**
  - Giant `[ ✓ TAP TO ACKNOWLEDGE ]` button silences the visual alarm and tells the coordinator desk who verified the change and when.
- **Pickup Urgency Timers:**
  - Auto-calculates remaining prep time (`🔥 DUE IN 15m`, `⏰ Due in 45m`, `⚠️ OVERDUE`).
  - Filter tabs: *All Active*, *Due Soon (<45m)*, *Needs Prep*, *Ready for Pickup*, *Fulfilled*.

---

## 🛠️ Tech Architecture & Zero-Config Design
- **Runtime:** Pure Node.js (runs with built-in standard modules).
- **Database:** Embedded SQLite via `node:sqlite` (`catering.db`). Persistent storage with zero external dependencies; persists across restarts.
- **Real-Time Push:** Server-Sent Events (SSE) with automatic reconnection. Changes sync instantly across multiple screens without page reloads.
- **Audio:** Web Audio API synthesizer for reliable in-browser alert bells.
