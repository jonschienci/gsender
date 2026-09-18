#include "../app/src/main/cpp/memory-budget.h"
#include <cassert>
#include <iostream>

int main() {
    using gsender::ChooseMemoryBudget;
    auto base = ChooseMemoryBudget(2048, 64);
    assert(base.appPlanningMiB == 1536);
    assert(base.oldSpaceMiB == 1024);
    assert(ChooseMemoryBudget(4096, 64).oldSpaceMiB == 2048);
    assert(ChooseMemoryBudget(8192, 64).oldSpaceMiB == 4096);
    assert(ChooseMemoryBudget(16384, 64).oldSpaceMiB == 8192);
    assert(ChooseMemoryBudget(8192, 32).oldSpaceMiB == 1536);
    assert(ChooseMemoryBudget(0, 32).oldSpaceMiB == 1024);
    assert(ChooseMemoryBudget(1536, 64).oldSpaceMiB < 1024);
    for (unsigned bits : {32, 64}) {
        uint64_t previous = 0;
        for (uint64_t ram = 512; ram <= 65536; ram += 17) {
            auto b = ChooseMemoryBudget(ram, bits);
            assert(b.oldSpaceMiB >= previous);
            assert(b.oldSpaceMiB % 64 == 0);
            assert(b.oldSpaceMiB < b.appPlanningMiB);
            if (bits == 32) assert(b.oldSpaceMiB <= 1536);
            previous = b.oldSpaceMiB;
        }
    }
    std::cout << "Memory budget tests passed (32/64-bit, 512 MiB–64 GiB)\n";
}
