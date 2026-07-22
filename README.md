# 📦 Inventory OS Pro - Enterprise Inventory Management System

A modern Inventory Management System built using **HTML, CSS, JavaScript, Node.js, and C++**. The application provides secure authentication, inventory tracking, analytics, audit logging, stock management, and CSV-based data persistence.

## 🚀 Features

### 🔐 Authentication & User Management
- Admin Login
- Manager Login
- User Signup & Approval Workflow
- Session Management
- Profile Management
- Role-Based Access Control

### 📦 Inventory Management
- Add Products
- Edit Products
- Delete Products
- Update Stock Quantity
- Search Products
- Category Filtering
- Pagination
- Low Stock Alerts
- CSV Import & Export

### 📊 Dashboard & Analytics
- Total Products
- Total Inventory Value
- Total Stock Units
- Low Stock Indicators
- Inventory Health Monitoring

### 📜 Audit Logs
- Track Inventory Changes
- User Activity Logs
- Timestamped Operations

### ⚡ Search
- Fast Product Search
- Binary Search Visualization
- Command Palette (⌘/Ctrl + K)

### 👥 Admin Features
- View Team Members
- User Approval
- User Management
- Role-Based Navigation

### 💾 Data Persistence
- Inventory stored in CSV
- User Accounts stored in JSON
- Audit Logs stored in JSON

---

# 🛠️ Technologies Used

## Frontend
- HTML5
- CSS3
- JavaScript (ES6)

## Backend
- Node.js
- Native HTTP Server

## Programming
- C++

## Data Storage
- CSV
- JSON

---

# 📂 Project Structure

```
Inventory-System/
│
├── app.js                 # Frontend JavaScript
├── server.js              # Node.js Server
├── index.html             # Main UI
├── style.css              # Styling
├── package.json
│
├── inventory.csv          # Inventory Database
├── users.json             # User Database
├── audit_logs.json        # Audit History
│
├── main.cpp
├── InventoryManager.cpp
├── InventoryManager.h
├── Item.cpp
├── Item.h
├── Utils.cpp
├── Utils.h
├── Makefile
│
└── README.md
```

---

# ⚙️ Installation

## Clone Repository

```bash
git clone https://github.com/your-username/inventory-management-system.git

cd inventory-management-system
```

---

## Install Dependencies

```bash
npm install
```

---

## Run Server

```bash
npm start
```

or

```bash
npm run dev
```

The application will run at:

```
http://localhost:3000
```

---

# C++ Module

Compile using:

```bash
make
```

or manually

```bash
g++ main.cpp InventoryManager.cpp Item.cpp Utils.cpp -o inventory_app
```

Run

```bash
./inventory_app
```

---

# Features Demonstrated

- STL Map
- STL Vector
- Binary Search
- Sorting Algorithms
- File Handling
- CSV Parsing
- Object-Oriented Programming
- Authentication
- CRUD Operations
- Analytics Dashboard
- Session Management

---

# Screenshots

Add screenshots here.

```
screenshots/
    dashboard.png
    login.png
    analytics.png
    catalog.png
```

---

# Future Improvements

- MongoDB Integration
- JWT Authentication
- Email Notifications
- Barcode Scanner
- QR Code Support
- Cloud Deployment
- Dark/Light Theme
- REST API Documentation

---

# Learning Outcomes

This project demonstrates practical implementation of:

- Data Structures
- Algorithms
- Object-Oriented Programming
- File Handling
- Backend Development
- Frontend Development
- Authentication
- Inventory Management Systems

---

# Author

**Riya Sharma**

B.Tech Computer Science & Engineering

Lovely Professional University

---

# License

This project is licensed under the MIT License.