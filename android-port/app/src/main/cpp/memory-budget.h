#pragma once
#include <algorithm>
#include <cstdint>

namespace gsender {
struct MemoryBudget {
    uint64_t totalMiB;
    uint64_t systemReserveMiB;
    uint64_t appPlanningMiB;
    uint64_t oldSpaceMiB;
    unsigned processBits;
};

// A 2 GiB tablet has a 1.5 GiB application planning allowance. Larger tablets
// scale up with physical RAM. This is neither a reservation nor a total RSS cap:
// Node buffers, Android and WebView allocations are outside V8 old-space.
// Leave 1/4 (at least 512 MiB) for Android/other apps, then 1/3 of the app
// allowance for native allocations, young-generation GC and the renderer.
inline MemoryBudget ChooseMemoryBudget(uint64_t totalMiB, unsigned processBits) {
    if (!totalMiB) totalMiB = 2048; // Conservative fallback if the OS query fails.
    const auto reserve = std::min(totalMiB / 2, std::max<uint64_t>(512, totalMiB / 4));
    const auto allowance = totalMiB - reserve;
    auto heap = std::max<uint64_t>(128, (allowance * 2 / 3 / 64) * 64);
    // A 32-bit process must also fit libraries, stacks and external buffers in
    // its address space, even when the tablet has much more physical RAM.
    if (processBits == 32) heap = std::min<uint64_t>(1536, heap);
    return {totalMiB, reserve, allowance, heap, processBits};
}
}
