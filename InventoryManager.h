#ifndef INVENTORY_MANAGER_H
#define INVENTORY_MANAGER_H

#include "Item.h"
#include <map>
#include <vector>
#include <string>
#include <optional>

enum class SortField {
    ID_ASC,
    ID_DESC,
    NAME_ASC,
    NAME_DESC,
    PRICE_ASC,
    PRICE_DESC,
    QUANTITY_ASC,
    QUANTITY_DESC
};

struct InventorySummary {
    int uniqueItemCount;
    int totalQuantity;
    double totalInventoryValue;
    int lowStockCount;
    Item mostExpensiveItem;
    Item leastExpensiveItem;
};

class InventoryManager {
private:
    // Primary storage: std::map indexed by Item ID for O(log N) operations
    std::map<int, Item> inventoryMap;

public:
    InventoryManager() = default;

    // CRUD Operations using std::map
    bool addItem(const Item& item);
    bool removeItem(int id);
    bool updateQuantity(int id, int newQuantity);
    bool updatePrice(int id, double newPrice);
    bool updateItemDetails(int id, const std::string& newName, const std::string& newCategory, double newPrice, int newReorderLevel);
    
    // Fast O(log N) lookup in std::map
    const Item* getItemById(int id) const;
    bool exists(int id) const;

    // Dynamic sorting using std::vector and std::sort algorithms
    std::vector<Item> getAllItemsSorted(SortField field = SortField::ID_ASC) const;

    // Search using std::vector, std::sort, and STL binary search (std::lower_bound)
    std::vector<Item> searchByNameBinary(const std::string& nameQuery) const;
    std::vector<Item> filterByCategory(const std::string& categoryQuery) const;

    // Stock management reports
    std::vector<Item> getLowStockItems() const;
    InventorySummary getSummaryStats() const;

    // Persistence (CSV File I/O)
    bool loadFromFile(const std::string& filename);
    bool saveToFile(const std::string& filename) const;

    size_t size() const { return inventoryMap.size(); }
    void clear() { inventoryMap.clear(); }
};

#endif // INVENTORY_MANAGER_H
