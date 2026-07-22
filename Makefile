CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2
TARGET = inventory_app
SRCS = main.cpp Item.cpp InventoryManager.cpp Utils.cpp
OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(OBJS)

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean
