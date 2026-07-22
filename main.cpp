#include "InventoryManager.h"
#include "Utils.h"
#include <iostream>
#include <iomanip>

const std::string FILE_PATH = "inventory.csv";

void seedSampleData(InventoryManager& manager) {
    if (manager.size() == 0) {
        manager.addItem(Item(101, "MacBook Pro 16", "Electronics", 2499.99, 12, 5));
        manager.addItem(Item(102, "Dell XPS 15", "Electronics", 1899.50, 8, 3));
        manager.addItem(Item(103, "Ergonomic Office Chair", "Furniture", 349.00, 4, 5));
        manager.addItem(Item(104, "Mechanical Keyboard", "Accessories", 129.99, 25, 10));
        manager.addItem(Item(105, "Wireless Gaming Mouse", "Accessories", 79.95, 3, 5));
        manager.addItem(Item(106, "4K UHD Monitor 27\"", "Electronics", 449.99, 2, 4));
        manager.addItem(Item(107, "USB-C Multiport Dock", "Accessories", 59.99, 18, 8));
        manager.addItem(Item(108, "Standing Desk Frame", "Furniture", 499.00, 1, 2));
        manager.saveToFile(FILE_PATH);
    }
}

void displayMenu() {
    Utils::printHeader("INVENTORY MANAGEMENT SYSTEM");
    std::cout << "  1. Add New Item\n";
    std::cout << "  2. Display & Sort Inventory (std::vector + std::sort)\n";
    std::cout << "  3. Fast Lookup by Item ID (std::map lookup)\n";
    std::cout << "  4. Search Item by Name (STL Binary Search)\n";
    std::cout << "  5. Update Item Stock Quantity\n";
    std::cout << "  6. Edit Item Details\n";
    std::cout << "  7. Remove Item from Inventory\n";
    std::cout << "  8. Low Stock Warnings & Reorder Alerts\n";
    std::cout << "  9. Inventory Analytics & Summary Report\n";
    std::cout << " 10. Save Inventory to CSV File\n";
    std::cout << "  0. Exit Application\n";
    Utils::printDivider('=', 76);
}

void handleAddItem(InventoryManager& manager) {
    Utils::printHeader("ADD NEW INVENTORY ITEM");
    int id = Utils::readInt("Enter Product ID (integer): ", 1, 999999);

    if (manager.exists(id)) {
        std::cout << " Error: Product ID " << id << " already exists in inventory!\n";
        return;
    }

    std::string name = Utils::readString("Enter Product Name: ");
    std::string category = Utils::readString("Enter Category: ");
    double price = Utils::readDouble("Enter Unit Price ($): ", 0.01, 1000000.0);
    int quantity = Utils::readInt("Enter Initial Stock Quantity: ", 0, 100000);
    int reorder = Utils::readInt("Enter Low Stock Reorder Threshold: ", 0, 1000);

    Item newItem(id, name, category, price, quantity, reorder);
    if (manager.addItem(newItem)) {
        std::cout << "\n Success: Item '" << name << "' added successfully to std::map!\n";
        manager.saveToFile(FILE_PATH);
    } else {
        std::cout << "\n Error: Failed to add item.\n";
    }
}

void handleDisplaySorted(const InventoryManager& manager) {
    Utils::printHeader("SORT & DISPLAY INVENTORY");
    std::cout << " Select Sort Criterion:\n";
    std::cout << "  1. ID (Ascending)\n";
    std::cout << "  2. ID (Descending)\n";
    std::cout << "  3. Name (A-Z)\n";
    std::cout << "  4. Name (Z-A)\n";
    std::cout << "  5. Price (Low to High)\n";
    std::cout << "  6. Price (High to Low)\n";
    std::cout << "  7. Quantity (Low to High)\n";
    std::cout << "  8. Quantity (High to Low)\n";

    int choice = Utils::readInt("Choice (1-8): ", 1, 8);
    SortField field = SortField::ID_ASC;

    switch (choice) {
        case 1: field = SortField::ID_ASC; break;
        case 2: field = SortField::ID_DESC; break;
        case 3: field = SortField::NAME_ASC; break;
        case 4: field = SortField::NAME_DESC; break;
        case 5: field = SortField::PRICE_ASC; break;
        case 6: field = SortField::PRICE_DESC; break;
        case 7: field = SortField::QUANTITY_ASC; break;
        case 8: field = SortField::QUANTITY_DESC; break;
    }

    std::vector<Item> sortedItems = manager.getAllItemsSorted(field);
    Utils::printItemTable(sortedItems);
}

void handleLookupById(const InventoryManager& manager) {
    Utils::printHeader("SEARCH ITEM BY ID (std::map)");
    int id = Utils::readInt("Enter Item ID to search: ", 1, 999999);

    const Item* item = manager.getItemById(id);
    if (item) {
        std::cout << "\n Found Item in O(log N) std::map lookup:\n";
        Utils::printSingleItem(*item);
    } else {
        std::cout << " Item with ID " << id << " not found.\n";
    }
}

void handleSearchByNameBinary(const InventoryManager& manager) {
    Utils::printHeader("SEARCH ITEM BY NAME (STL Binary Search)");
    std::string query = Utils::readString("Enter Product Name or Keyword to search: ");

    std::vector<Item> results = manager.searchByNameBinary(query);
    if (!results.empty()) {
        std::cout << "\n Search Results for '" << query << "':\n";
        Utils::printItemTable(results);
    } else {
        std::cout << "\n No items matching '" << query << "' were found.\n";
    }
}

void handleUpdateStock(InventoryManager& manager) {
    Utils::printHeader("UPDATE STOCK QUANTITY");
    int id = Utils::readInt("Enter Item ID: ", 1, 999999);

    const Item* item = manager.getItemById(id);
    if (!item) {
        std::cout << " Item ID " << id << " not found.\n";
        return;
    }

    std::cout << " Current Item: " << item->name << " | Current Quantity: " << item->quantity << "\n";
    std::cout << " Options:\n";
    std::cout << "  1. Set Absolute Quantity\n";
    std::cout << "  2. Restock (Add Stock)\n";
    std::cout << "  3. Sell / Despatch (Reduce Stock)\n";

    int choice = Utils::readInt("Choice (1-3): ", 1, 3);
    int newQty = item->quantity;

    if (choice == 1) {
        newQty = Utils::readInt("Enter new total stock quantity: ", 0, 100000);
    } else if (choice == 2) {
        int add = Utils::readInt("Enter quantity to add: ", 1, 50000);
        newQty += add;
    } else if (choice == 3) {
        int reduce = Utils::readInt("Enter quantity to sell: ", 1, item->quantity);
        newQty -= reduce;
    }

    if (manager.updateQuantity(id, newQty)) {
        std::cout << "\n Success: Stock updated! New quantity for '" << item->name << "' is " << newQty << ".\n";
        manager.saveToFile(FILE_PATH);
    }
}

void handleEditItem(InventoryManager& manager) {
    Utils::printHeader("EDIT ITEM DETAILS");
    int id = Utils::readInt("Enter Item ID to edit: ", 1, 999999);

    const Item* item = manager.getItemById(id);
    if (!item) {
        std::cout << " Item ID " << id << " not found.\n";
        return;
    }

    std::cout << " Current Name     : " << item->name << "\n";
    std::cout << " Current Category : " << item->category << "\n";
    std::cout << " Current Price    : $" << item->price << "\n";
    std::cout << " Current Reorder  : " << item->reorderLevel << "\n\n";

    std::string newName = Utils::readString("Enter New Name: ");
    std::string newCategory = Utils::readString("Enter New Category: ");
    double newPrice = Utils::readDouble("Enter New Price ($): ", 0.01, 1000000.0);
    int newReorder = Utils::readInt("Enter New Low Stock Reorder Threshold: ", 0, 1000);

    if (manager.updateItemDetails(id, newName, newCategory, newPrice, newReorder)) {
        std::cout << "\n Success: Item details updated.\n";
        manager.saveToFile(FILE_PATH);
    }
}

void handleRemoveItem(InventoryManager& manager) {
    Utils::printHeader("REMOVE ITEM FROM INVENTORY");
    int id = Utils::readInt("Enter Item ID to remove: ", 1, 999999);

    const Item* item = manager.getItemById(id);
    if (!item) {
        std::cout << " Item ID " << id << " not found.\n";
        return;
    }

    std::cout << " WARNING: Are you sure you want to delete '" << item->name << "' (ID: " << id << ")?\n";
    std::string confirm = Utils::readString("Type 'YES' to confirm: ");
    if (Utils::toLower(confirm) == "yes") {
        if (manager.removeItem(id)) {
            std::cout << "\n Item removed from inventory.\n";
            manager.saveToFile(FILE_PATH);
        }
    } else {
        std::cout << " Operation cancelled.\n";
    }
}

void handleLowStockAlerts(const InventoryManager& manager) {
    Utils::printHeader("LOW STOCK ALERTS & REORDER LIST");
    std::vector<Item> lowStock = manager.getLowStockItems();

    if (lowStock.empty()) {
        std::cout << " All stock levels are sufficient! No reorder needed.\n";
    } else {
        std::cout << " ATTENTION: The following " << lowStock.size() << " item(s) are at or below reorder threshold:\n";
        Utils::printItemTable(lowStock);
    }
}

void handleAnalyticsSummary(const InventoryManager& manager) {
    Utils::printHeader("INVENTORY ANALYTICS REPORT");
    InventorySummary summary = manager.getSummaryStats();

    if (summary.uniqueItemCount == 0) {
        std::cout << " Inventory is empty.\n";
        return;
    }

    std::cout << " Total Unique SKUs        : " << summary.uniqueItemCount << "\n";
    std::cout << " Total Stock Units        : " << summary.totalQuantity << "\n";
    std::cout << " Total Inventory Value    : $" << std::fixed << std::setprecision(2) << summary.totalInventoryValue << "\n";
    std::cout << " Low Stock Items Count    : " << summary.lowStockCount << "\n";
    Utils::printDivider('-', 50);
    std::cout << " Most Expensive Item      : " << summary.mostExpensiveItem.name << " ($" << summary.mostExpensiveItem.price << ")\n";
    std::cout << " Least Expensive Item     : " << summary.leastExpensiveItem.name << " ($" << summary.leastExpensiveItem.price << ")\n";
    Utils::printDivider('-', 50);
}

int main() {
    InventoryManager manager;

    std::cout << " Loading inventory database...\n";
    if (!manager.loadFromFile(FILE_PATH)) {
        std::cout << " No existing inventory data file found. Initializing seed data...\n";
        seedSampleData(manager);
    } else {
        std::cout << " Inventory database loaded (" << manager.size() << " records).\n";
    }

    int choice = -1;
    while (choice != 0) {
        displayMenu();
        choice = Utils::readInt("Select Option (0-10): ", 0, 10);

        switch (choice) {
            case 1: handleAddItem(manager); break;
            case 2: handleDisplaySorted(manager); break;
            case 3: handleLookupById(manager); break;
            case 4: handleSearchByNameBinary(manager); break;
            case 5: handleUpdateStock(manager); break;
            case 6: handleEditItem(manager); break;
            case 7: handleRemoveItem(manager); break;
            case 8: handleLowStockAlerts(manager); break;
            case 9: handleAnalyticsSummary(manager); break;
            case 10: 
                if (manager.saveToFile(FILE_PATH)) {
                    std::cout << " Inventory data saved to " << FILE_PATH << " successfully.\n";
                } else {
                    std::cout << " Failed to save data.\n";
                }
                break;
            case 0:
                manager.saveToFile(FILE_PATH);
                std::cout << "\n Thank you for using Inventory Management System. Goodbye!\n";
                break;
        }
    }

    return 0;
}
