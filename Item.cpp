#include "Item.h"
#include <sstream>
#include <iomanip>

std::string Item::toCSV() const {
    std::ostringstream ss;
    ss << id << ","
       << "\"" << name << "\","
       << "\"" << category << "\","
       << std::fixed << std::setprecision(2) << price << ","
       << quantity << ","
       << reorderLevel;
    return ss.str();
}

Item Item::fromCSV(const std::string& line) {
    Item item;
    std::vector<std::string> fields;
    std::string current;
    bool inQuotes = false;

    for (size_t i = 0; i < line.length(); ++i) {
        char c = line[i];
        if (c == '"') {
            inQuotes = !inQuotes;
        } else if (c == ',' && !inQuotes) {
            fields.push_back(current);
            current.clear();
        } else {
            current.push_back(c);
        }
    }
    fields.push_back(current);

    if (fields.size() >= 6) {
        try {
            item.id = std::stoi(fields[0]);
            item.name = fields[1];
            item.category = fields[2];
            item.price = std::stod(fields[3]);
            item.quantity = std::stoi(fields[4]);
            item.reorderLevel = std::stoi(fields[5]);
        } catch (const std::exception&) {
            // Ignore malformed line
        }
    }

    return item;
}
