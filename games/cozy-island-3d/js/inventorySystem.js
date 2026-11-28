// 20-slot stackable inventory manager for Cozy Island 3D

export const INVENTORY_SLOTS = 20;

export class InventorySystem {
  constructor(catalog, saveData) {
    this.catalog = catalog; // { items: {...}, starterInventory: [...], paths: [...] }
    this.save = saveData;
    this._ensureSlots();
  }

  _ensureSlots() {
    if (!Array.isArray(this.save.inventory) || this.save.inventory.length !== INVENTORY_SLOTS) {
      this.save.inventory = new Array(INVENTORY_SLOTS).fill(null);
      if (!this.save.starterGranted) {
        (this.catalog.starterInventory || []).forEach((entry) => {
          this.addItem(entry.itemId, entry.count);
        });
        this.save.starterGranted = true;
      }
    }
  }

  getDef(itemId) {
    return this.catalog.items?.[itemId] || null;
  }

  registerCreatures(creaturesData) {
    if (!creaturesData) return;
    const add = (c, category, descPrefix) => {
      if (!this.catalog.items[c.id]) {
        this.catalog.items[c.id] = {
          id: c.id,
          name: c.name,
          icon: c.icon,
          category,
          stackMax: 10,
          sellPrice: c.price,
          walkable: false,
          desc: `${descPrefix}，可在背包中售出換取 ${c.price.toLocaleString()} 鈴錢。`
        };
      }
    };
    (creaturesData.fish || []).forEach((f) => add(f, 'fish', f.habitat === 'sea' ? '在海岸釣起的海魚' : '在河流釣起的淡水魚'));
    (creaturesData.bugs || []).forEach((b) => add(b, 'bug', '在島上捕捉到的可愛昆蟲'));
    (creaturesData.fossils || []).forEach((fo) => add(fo, 'fossil', '從島嶼地底挖掘出的遠古化石'));
  }

  getSlots() {
    return this.save.inventory;
  }

  countItem(itemId) {
    let total = 0;
    for (const slot of this.save.inventory) {
      if (slot && slot.itemId === itemId) total += slot.count;
    }
    return total;
  }

  addItem(itemId, count = 1) {
    const def = this.getDef(itemId);
    if (!def || count <= 0) return false;
    let remaining = count;

    // 1. Fill existing stacks
    for (const slot of this.save.inventory) {
      if (slot && slot.itemId === itemId && slot.count < def.stackMax) {
        const space = def.stackMax - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        if (remaining <= 0) return true;
      }
    }

    // 2. Fill empty slots
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      if (!this.save.inventory[i]) {
        const add = Math.min(def.stackMax, remaining);
        this.save.inventory[i] = { itemId, count: add };
        remaining -= add;
        if (remaining <= 0) return true;
      }
    }
    return remaining < count;
  }

  removeItem(itemId, count = 1) {
    if (this.countItem(itemId) < count) return false;
    let remaining = count;
    for (let i = INVENTORY_SLOTS - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.save.inventory[i];
      if (slot && slot.itemId === itemId) {
        const take = Math.min(slot.count, remaining);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) this.save.inventory[i] = null;
      }
    }
    return true;
  }

  removeAtSlot(slotIdx, count = 1) {
    const slot = this.save.inventory[slotIdx];
    if (!slot || slot.count < count) return null;
    const itemId = slot.itemId;
    slot.count -= count;
    if (slot.count <= 0) this.save.inventory[slotIdx] = null;
    return itemId;
  }

  getPlaceableItems() {
    const map = new Map();
    for (const slot of this.save.inventory) {
      if (!slot) continue;
      const def = this.getDef(slot.itemId);
      if (def && def.category === 'furniture') {
        map.set(slot.itemId, (map.get(slot.itemId) || 0) + slot.count);
      }
    }
    return Array.from(map.entries()).map(([itemId, count]) => ({
      ...this.getDef(itemId),
      count
    }));
  }
}
