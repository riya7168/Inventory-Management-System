#include "InventoryManager.h"
#include "Utils.h"
#include <fstream>
#include <iostream>
#include <algorithm>

bool InventoryManager::addItem(const Item& item) {
    // std::map insert returns pair<iterator, bool> indicating success if key didn't exist
    auto result = inventoryMap.insert({item.id, item});
    return result.second;
}

bool InventoryManager::removeItem(int id) {
    // std::map erase returns number of elements removed (1 or 0)
    return inventoryMap.erase(id) > 0;
}

bool InventoryManager::updateQuantity(int id, int newQuantity) {
    auto it = inventoryMap.find(id);
    if (it != inventoryMap.end()) {
        it->second.quantity = newQuantity;
        return true;
    }
    return false;
}

bool InventoryManager::updatePrice(int id, double newPrice) {
    auto it = inventoryMap.find(id);
    if (it != inventoryMap.end()) {
        it->second.price = newPrice;
        return true;
    }
    return false;
}

bool InventoryManager::updateItemDetails(int id, const std::string& newName, const std::string& newCategory, double newPrice, int newReorderLevel) {
    auto it = inventoryMap.find(id);
    if (it != inventoryMap.end()) {
        it->second.name = newName;
        it->second.category = newCategory;
        it->second.price = newPrice;
        it->second.reorderLevel = newReorderLevel;
        return true;
    }
    return false;
}

const Item* InventoryManager::getItemById(int id) const {
    auto it = inventoryMap.find(id);
    if (it != inventoryMap.end()) {
        return &(it->second);
    }
    return nullptr;
}

bool InventoryManager::exists(int id) const {
    return inventoryMap.find(id) != inventoryMap.end();
}

std::vector<Item> InventoryManager::getAllItemsSorted(SortField field) const {
    std::vector<Item> items;
    items.reserve(inventoryMap.size());

    // Transfer map elements to vector for flexible sorting algorithms
    for (const auto& pair : inventoryMap) {
        items.push_back(pair.second);
    }

    // Apply STL std::sort with lambda comparators according to SortField
    switch (field) {
        case SortField::ID_ASC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.id < b.id;
            });
            break;
        case SortField::ID_DESC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.id > b.id;
            });
            break;
        case SortField::NAME_ASC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return Utils::toLower(a.name) < Utils::toLower(b.name);
            });
            break;
        case SortField::NAME_DESC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return Utils::toLower(a.name) > Utils::toLower(b.name);
            });
            break;
        case SortField::PRICE_ASC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.price < b.price;
            });
            break;
        case SortField::PRICE_DESC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.price > b.price;
            });
            break;
        case SortField::QUANTITY_ASC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.quantity < b.quantity;
            });
            break;
        case SortField::QUANTITY_DESC:
            std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
                return a.quantity > b.quantity;
            });
            break;
    }

    return items;
}

std::vector<Item> InventoryManager::searchByNameBinary(const std::string& nameQuery) const {
    std::vector<Item> items;
    items.reserve(inventoryMap.size());
    for (const auto& pair : inventoryMap) {
        items.push_back(pair.second);
    }

    if (items.empty()) return items;

    // Step 1: Sort items alphabetically by name
    std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
        return Utils::toLower(a.name) < Utils::toLower(b.name);
    });

    std::string queryLower = Utils::toLower(nameQuery);

    // Step 2: Perform Binary Search using std::lower_bound to find the first potential match
    auto lowerIt = std::lower_bound(items.begin(), items.end(), queryLower,
        [](const Item& item, const std::string& val) {
            return Utils::toLower(item.name) < val;
        });

    std::vector<Item> results;
    
    // Step 3: Scan from lower_bound position for exact or prefix matches
    for (auto it = lowerIt; it != items.end(); ++it) {
        std::string itemLower = Utils::toLower(it->name);
        if (itemLower.find(queryLower) == 0 || itemLower.find(queryLower) != std::string::npos) {
            results.push_back(*it);
        } else if (itemLower > queryLower && itemLower.substr(0, queryLower.length()) != queryLower) {
            // Once names lexicographically exceed query prefix without matching, stop
            break;
        }
    }

    // Fallback: If prefix binary search yields no results, check substring match across vector
    if (results.empty()) {
        for (const auto& item : items) {
            if (Utils::toLower(item.name).find(queryLower) != std::string::npos) {
                results.push_back(item);
            }
        }
    }

    return results;
}

std::vector<Item> InventoryManager::filterByCategory(const std::string& categoryQuery) const {
    std::vector<Item> results;
    std::string targetCat = Utils::toLower(categoryQuery);

    for (const auto& pair : inventoryMap) {
        if (Utils::toLower(pair.second.category) == targetCat) {
            results.push_back(pair.second);
        }
    }

    return results;
}

std::vector<Item> InventoryManager::getLowStockItems() const {
    std::vector<Item> lowStockItems;
    for (const auto& pair : inventoryMap) {
        if (pair.second.isLowStock()) {
            lowStockItems.push_back(pair.second);
        }
    }
    return lowStockItems;
}

InventorySummary InventoryManager::getSummaryStats() const {
    InventorySummary summary{0, 0, 0.0, 0, {}, {}};

    if (inventoryMap.empty()) {
        return summary;
    }

    summary.uniqueItemCount = static_cast<int>(inventoryMap.size());
    summary.mostExpensiveItem = inventoryMap.begin()->second;
    summary.leastExpensiveItem = inventoryMap.begin()->second;

    for (const auto& pair : inventoryMap) {
        const Item& item = pair.second;
        summary.totalQuantity += item.quantity;
        summary.totalInventoryValue += item.getTotalValue();
        if (item.isLowStock()) {
            summary.lowStockCount++;
        }
        if (item.price > summary.mostExpensiveItem.price) {
            summary.mostExpensiveItem = item;
        }
        if (item.price < summary.leastExpensiveItem.price) {
            summary.leastExpensiveItem = item;
        }
    }

    return summary;
}

bool InventoryManager::loadFromFile(const std::string& filename) {
    std::ifstream inFile(filename);
    if (!inFile.is_open()) {
        return false;
    }

    std::string line;
    // Skip header line if present
    if (std::getline(inFile, line)) {
        if (line.find("ID,") != 0 && line.find("id,") != 0) {
            // Not a header line, parse it as data
            if (!line.empty()) {
                Item item = Item::fromCSV(line);
                if (item.id > 0) addItem(item);
            }
        }
    }

    while (std::getline(inFile, line)) {
        line = Utils::trim(line);
        if (!line.empty()) {
            Item item = Item::fromCSV(line);
            if (item.id > 0) {
                addItem(item);
            }
        }
    }

    inFile.close();
    return true;
}

bool InventoryManager::saveToFile(const std::string& filename) const {
    std::ofstream outFile(filename);
    if (!outFile.is_open()) {
        return false;
    }

    outFile << "ID,Name,Category,Price,Quantity,ReorderLevel\n";
    for (const auto& pair : inventoryMap) {
        outFile << pair.second.toCSV() << "\n";
    }

    outFile.close();
    return true;
}
