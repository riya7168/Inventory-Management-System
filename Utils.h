#ifndef UTILS_H
#define UTILS_H

#include "Item.h"
#include <vector>
#include <string>

namespace Utils {
    // Safe input reading
    int readInt(const std::string& prompt, int minVal = -1000000, int maxVal = 1000000);
    double readDouble(const std::string& prompt, double minVal = 0.0, double maxVal = 1e9);
    std::string readString(const std::string& prompt);

    // String helpers
    std::string toLower(const std::string& str);
    std::string trim(const std::string& str);

    // Console formatting
    void printHeader(const std::string& title);
    void printDivider(char ch = '-', int length = 76);
    void printItemTable(const std::vector<Item>& items);
    void printSingleItem(const Item& item);
}

#endif // UTILS_H
