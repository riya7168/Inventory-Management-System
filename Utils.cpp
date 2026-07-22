#include "Utils.h"
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <limits>
#include <cctype>

namespace Utils {

int readInt(const std::string& prompt, int minVal, int maxVal) {
    int value;
    while (true) {
        std::cout << prompt;
        if (std::cin >> value) {
            if (value >= minVal && value <= maxVal) {
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                return value;
            } else {
                std::cout << " Error: Value must be between " << minVal << " and " << maxVal << ".\n";
            }
        } else {
            std::cout << " Error: Invalid integer. Please enter a valid number.\n";
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        }
    }
}

double readDouble(const std::string& prompt, double minVal, double maxVal) {
    double value;
    while (true) {
        std::cout << prompt;
        if (std::cin >> value) {
            if (value >= minVal && value <= maxVal) {
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                return value;
            } else {
                std::cout << " Error: Value must be between " << minVal << " and " << maxVal << ".\n";
            }
        } else {
            std::cout << " Error: Invalid number format. Please enter a valid double.\n";
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        }
    }
}

std::string readString(const std::string& prompt) {
    std::string value;
    while (true) {
        std::cout << prompt;
        std::getline(std::cin, value);
        value = trim(value);
        if (!value.empty()) {
            return value;
        }
        std::cout << " Error: Input cannot be empty.\n";
    }
}

std::string toLower(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(), [](unsigned char c) {
        return std::tolower(c);
    });
    return result;
}

std::string trim(const std::string& str) {
    size_t first = str.find_first_not_of(" \t\n\r");
    if (first == std::string::npos) return "";
    size_t last = str.find_last_not_of(" \t\n\r");
    return str.substr(first, (last - first + 1));
}

void printHeader(const std::string& title) {
    std::cout << "\n============================================================================\n";
    std::cout << "  " << title << "\n";
    std::cout << "============================================================================\n";
}

void printDivider(char ch, int length) {
    std::cout << std::string(length, ch) << "\n";
}

void printItemTable(const std::vector<Item>& items) {
    if (items.empty()) {
        std::cout << "\n No items found in inventory.\n";
        return;
    }

    printDivider('-', 80);
    std::cout << std::left 
              << std::setw(8)  << "ID"
              << std::setw(24) << "Name"
              << std::setw(16) << "Category"
              << std::setw(10) << "Price ($)"
              << std::setw(8)  << "Qty"
              << std::setw(8)  << "Reorder"
              << std::setw(6)  << "Status"
              << "\n";
    printDivider('-', 80);

    for (const auto& item : items) {
        std::string status = item.isLowStock() ? "[LOW]" : "OK";
        std::cout << std::left 
                  << std::setw(8)  << item.id
                  << std::setw(24) << (item.name.length() > 22 ? item.name.substr(0, 21) + "..." : item.name)
                  << std::setw(16) << (item.category.length() > 14 ? item.category.substr(0, 13) + "..." : item.category)
                  << std::fixed    << std::setprecision(2)
                  << std::setw(10) << item.price
                  << std::setw(8)  << item.quantity
                  << std::setw(8)  << item.reorderLevel
                  << std::setw(6)  << status
                  << "\n";
    }
    printDivider('-', 80);
    std::cout << " Total records displayed: " << items.size() << "\n";
}

void printSingleItem(const Item& item) {
    printDivider('-', 50);
    std::cout << " Item Details (ID: " << item.id << ")\n";
    printDivider('-', 50);
    std::cout << " Name          : " << item.name << "\n";
    std::cout << " Category      : " << item.category << "\n";
    std::cout << " Price ($)     : " << std::fixed << std::setprecision(2) << item.price << "\n";
    std::cout << " Quantity      : " << item.quantity << "\n";
    std::cout << " Reorder Level : " << item.reorderLevel << "\n";
    std::cout << " Total Value   : $" << std::fixed << std::setprecision(2) << item.getTotalValue() << "\n";
    std::cout << " Stock Status  : " << (item.isLowStock() ? "WARNING: LOW STOCK" : "Normal") << "\n";
    printDivider('-', 50);
}

} // namespace Utils
