export type ShopCategory =
  | "weapons"
  | "armor"
  | "medical"
  | "tickets"
  | "special"
  | "tools";

export type ShopItem = {
  id: string;
  category: ShopCategory;

  name: string;
  nameEn: string;

  description: string;
  descriptionEn: string;

  price: number;
  icon: string;
};

export type ShopCategoryDefinition = {
  id: ShopCategory;

  name: string;
  nameEn: string;

  description: string;
  descriptionEn: string;

  icon: string;
};

export const SHOP_CATEGORIES: ShopCategoryDefinition[] = [
  {
    id: "weapons",
    name: "Vũ khí",
    nameEn: "Weapons",
    description: "Các loại vũ khí và trang bị tấn công.",
    descriptionEn: "Weapons and offensive equipment.",
    icon: "🔫",
  },
  {
    id: "armor",
    name: "Giáp & phòng thủ",
    nameEn: "Armor & Defense",
    description: "Trang bị giúp bảo vệ người chơi.",
    descriptionEn: "Equipment that helps protect the player.",
    icon: "🛡️",
  },
  {
    id: "medical",
    name: "Thuốc & hồi phục",
    nameEn: "Medical",
    description: "Vật phẩm hỗ trợ sức khỏe và HP.",
    descriptionEn: "Items that support health and HP.",
    icon: "💊",
  },
  {
    id: "tickets",
    name: "Vé đặc biệt",
    nameEn: "Special Tickets",
    description: "Vé dùng để mở khóa các nội dung đặc biệt.",
    descriptionEn: "Tickets used to unlock special content.",
    icon: "🎫",
  },
  {
    id: "special",
    name: "Đồ đặc biệt",
    nameEn: "Special Items",
    description: "Những vật phẩm hiếm và độc đáo.",
    descriptionEn: "Rare and unique items.",
    icon: "💎",
  },
  {
    id: "tools",
    name: "Dụng cụ",
    nameEn: "Tools",
    description: "Các dụng cụ hỗ trợ trong hành trình.",
    descriptionEn: "Useful tools for the journey.",
    icon: "🔧",
  },
];

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "pistol",
    category: "weapons",
    name: "Pistol",
    nameEn: "Pistol",
    description:
      "Một khẩu súng ngắn dùng trong các tình huống nguy hiểm trong game.",
    descriptionEn:
      "A handgun for dangerous situations in the game.",
    price: 33750000,
    icon: "🔫",
  },
  {
    id: "heavy_pistol",
    category: "weapons",
    name: "Heavy Pistol",
    nameEn: "Heavy Pistol",
    description:
      "Một phiên bản mạnh hơn của pistol thông thường.",
    descriptionEn:
      "A stronger version of the standard pistol.",
    price: 45000000,
    icon: "🔫",
  },
  {
    id: "ammo",
    category: "weapons",
    name: "Đạn",
    nameEn: "Ammunition",
    description:
      "Đạn dùng chung cho tất cả các loại súng trong game. Giá tính theo từng viên.",
    descriptionEn:
      "Ammunition shared by all firearms in the game. Price is per round.",
    price: 67000,
    icon: "🟤",
  },
  {
    id: "light_armor",
    category: "armor",
    name: "Giáp nhẹ",
    nameEn: "Light Armor",
    description:
      "Trang bị phòng thủ cơ bản.",
    descriptionEn:
      "Basic defensive equipment.",
    price: 18750000,
    icon: "🛡️",
  },
  {
    id: "tactical_vest",
    category: "armor",
    name: "Áo giáp chiến thuật",
    nameEn: "Tactical Vest",
    description:
      "Trang bị phòng thủ cao cấp hơn.",
    descriptionEn:
      "Advanced defensive equipment.",
    price: 37500000,
    icon: "🦺",
  },
  {
    id: "medkit",
    category: "medical",
    name: "Túi cứu thương",
    nameEn: "Medkit",
    description:
      "Một vật phẩm hỗ trợ hồi phục HP.",
    descriptionEn:
      "An item that helps restore HP.",
    price: 3750000,
    icon: "🩹",
  },
  {
    id: "medicine",
    category: "medical",
    name: "Thuốc hồi phục",
    nameEn: "Medicine",
    description:
      "Vật phẩm y tế dùng để hỗ trợ hồi phục.",
    descriptionEn:
      "Medical supplies used for recovery.",
    price: 2625000,
    icon: "💊",
  },
  {
    id: "shop_ticket",
    category: "tickets",
    name: "Vé mở khóa Shop",
    nameEn: "Shop Unlock Ticket",
    description:
      "Một loại vé đặc biệt dùng để mở khóa nội dung Shop.",
    descriptionEn:
      "A special ticket used to unlock Shop content.",
    price: 11250000,
    icon: "🎫",
  },
  {
    id: "special_ticket",
    category: "tickets",
    name: "Vé đặc biệt",
    nameEn: "Special Ticket",
    description:
      "Vé dùng cho một số nội dung đặc biệt trong game.",
    descriptionEn:
      "A ticket for some special game content.",
    price: 22500000,
    icon: "🎟️",
  },
  {
    id: "mystery_stone",
    category: "special",
    name: "Viên đá bí ẩn",
    nameEn: "Mystery Stone",
    description:
      "Một vật phẩm bí ẩn chưa rõ công dụng.",
    descriptionEn:
      "A mysterious item with an unknown purpose.",
    price: 9000000,
    icon: "💎",
  },
  {
    id: "flashlight",
    category: "tools",
    name: "Đèn pin",
    nameEn: "Flashlight",
    description:
      "Một chiếc đèn pin hữu ích khi di chuyển.",
    descriptionEn:
      "A useful flashlight for travelling.",
    price: 2625000,
    icon: "🔦",
  },
  {
    id: "backpack",
    category: "tools",
    name: "Ba lô",
    nameEn: "Backpack",
    description:
      "Tăng khả năng mang theo vật phẩm.",
    descriptionEn:
      "Increases item carrying capacity.",
    price: 6000000,
    icon: "🎒",
  },
];

export function getItemsByCategory(category: ShopCategory) {
  return SHOP_ITEMS.filter(
    (item) => item.category === category
  );
}