#ifndef ITEM_H
#define ITEM_H

#include <string>

struct Item {
    int id;
    std::string name;
    std::string category;
    double price;
    int quantity;
    int reorderLevel;

    Item() : id(0), price(0.0), quantity(0), reorderLevel(5) {}
    Item(int id, std::string name, std::string category, double price, int quantity, int reorderLevel = 5)
        : id(id), name(name), category(category), price(price), quantity(quantity), reorderLevel(reorderLevel) {}

    double getTotalValue() const {
        return price * quantity;
    }

    bool isLowStock() const {
        return quantity <= reorderLevel;
    }

    std::string toCSV() const;
    static Item fromCSV(const std::string& line);
};

#endif // ITEM_H
