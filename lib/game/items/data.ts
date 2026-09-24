import type {
  ItemDefinition,
  SidequestDefinition,
} from "./types";

/* =========================================================
   SIDEQUEST DEFINITIONS
========================================================= */

export const SIDEQUESTS: SidequestDefinition[] = [
  {
    id: "the_grateful_stranger",
    name: "Người lạ biết ơn",
    name_en: "The Grateful Stranger",
    description:
      "Một người lạ từng được bạn giúp đỡ đang tìm cách trả ơn.",
    description_en:
      "A stranger you once helped is looking for a way to repay you.",
    triggerItemId: "first_aid_kit",
    repeatable: false,
  },

  {
    id: "the_missing_map",
    name: "Con đường không có trên bản đồ",
    name_en: "The Road Missing From the Map",
    description:
      "Một con đường cũ xuất hiện trên tấm bản đồ đã bạc màu.",
    description_en:
      "An old road appears on a faded map.",
    triggerItemId: "old_map",
    repeatable: false,
  },

  {
    id: "room_number_17",
    name: "Căn phòng số 17",
    name_en: "Room Number 17",
    description:
      "Chiếc chìa khóa cũ mở ra một nơi mà không ai trong nhóm biết đến.",
    description_en:
      "An old key opens a place nobody in the group knows about.",
    triggerItemId: "old_key",
    repeatable: false,
  },

  {
    id: "the_old_radio",
    name: "Tín hiệu lúc nửa đêm",
    name_en: "The Midnight Signal",
    description:
      "Chiếc radio bắt được một tín hiệu kỳ lạ vào ban đêm.",
    description_en:
      "The radio catches a strange signal late at night.",
    triggerItemId: "old_radio",
    repeatable: false,
  },

  {
    id: "the_unpaid_debt",
    name: "Món nợ cũ",
    name_en: "An Old Debt",
    description:
      "Một món đồ tưởng như vô giá trị lại liên quan đến một món nợ từ nhiều năm trước.",
    description_en:
      "A seemingly worthless object is connected to an old debt.",
    triggerItemId: "old_envelope",
    repeatable: false,
  },
];

/* =========================================================
   ITEM DEFINITIONS
========================================================= */

export const ITEMS: ItemDefinition[] = [
  /* =====================================================
     SURVIVAL
  ===================================================== */

  {
    id: "first_aid_kit",
    category: "survival",
    rarity: "common",

    name: "Bộ sơ cứu",
    name_en: "First Aid Kit",

    description:
      "Một bộ sơ cứu cũ nhưng vẫn còn đủ dụng cụ cơ bản.",
    description_en:
      "An old first aid kit with enough basic medical supplies.",

    price: 350_000,
    icon: "🩹",

    stackable: true,
    spawn_weight: 100,

    selfUse: {
      description:
        "Tự sơ cứu và hồi phục 20 Máu.",
      statEffect: {
        hp: 20,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Sơ cứu cho một người chơi khác và hồi phục 15 Máu cho họ.",
      statEffect: {
        hp: 15,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },

    sidequestUse: {
      description:
        "Dùng bộ sơ cứu để giúp một người lạ bị thương, mở Sidequest Người lạ biết ơn.",
      sidequestId: "the_grateful_stranger",
      consume: true,
    },
  },

  {
    id: "painkillers",
    category: "survival",
    rarity: "common",

    name: "Thuốc giảm đau",
    name_en: "Painkillers",

    description:
      "Một vỉ thuốc giảm đau còn sử dụng được.",
    description_en:
      "A strip of painkillers that can still be used.",

    price: 180_000,
    icon: "💊",

    stackable: true,
    spawn_weight: 110,

    selfUse: {
      description:
        "Giảm đau và hồi phục 8 Máu.",
      statEffect: {
        hp: 8,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Đưa thuốc cho một người chơi khác, giúp họ hồi phục 6 Máu.",
      statEffect: {
        hp: 6,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },
  },

  {
    id: "food_pack",
    category: "survival",
    rarity: "common",

    name: "Túi đồ ăn",
    name_en: "Food Pack",

    description:
      "Một phần đồ ăn đóng gói có thể dùng trong lúc khó khăn.",
    description_en:
      "A packed meal that can help during difficult times.",

    price: 120_000,
    icon: "🍱",

    stackable: true,
    spawn_weight: 130,

    selfUse: {
      description:
        "Ăn để hồi phục 5 Máu.",
      statEffect: {
        hp: 5,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Chia đồ ăn cho một người chơi khác, giúp họ hồi phục 5 Máu.",
      statEffect: {
        hp: 5,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },
  },

  {
    id: "warm_jacket",
    category: "survival",
    rarity: "uncommon",

    name: "Áo khoác cũ",
    name_en: "Old Jacket",

    description:
      "Một chiếc áo khoác cũ nhưng đủ tốt để chống lại thời tiết.",
    description_en:
      "An old jacket that still provides protection from the weather.",

    price: 450_000,
    icon: "🧥",

    stackable: false,
    spawn_weight: 80,

    selfUse: {
      description:
        "Giữ lại áo để giảm ảnh hưởng của một sự kiện thời tiết xấu.",
      consume: false,
    },

    playerUse: {
      description:
        "Đưa áo cho một người chơi khác để họ được bảo vệ khỏi thời tiết xấu.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },
  },

  {
    id: "flashlight",
    category: "survival",
    rarity: "common",

    name: "Đèn pin",
    name_en: "Flashlight",

    description:
      "Một chiếc đèn pin cũ vẫn còn hoạt động.",
    description_en:
      "An old flashlight that still works.",

    price: 250_000,
    icon: "🔦",

    stackable: false,
    spawn_weight: 100,

    selfUse: {
      description:
        "Sử dụng đèn pin để giảm rủi ro khi khám phá ban đêm.",
      consume: false,
    },

    playerUse: {
      description:
        "Đưa đèn pin cho một người chơi khác để họ có thể khám phá an toàn hơn.",
      relationshipEffect: {
        relationship: 1,
      },
      consume: false,
    },
  },

  /* =====================================================
     MONEY
  ===================================================== */

  {
    id: "old_envelope",
    category: "money",
    rarity: "uncommon",

    name: "Phong bì cũ",
    name_en: "Old Envelope",

    description:
      "Một phong bì cũ chứa một khoản tiền nhỏ.",
    description_en:
      "An old envelope containing a small amount of money.",

    price: 250_000,
    icon: "✉️",

    stackable: true,
    spawn_weight: 90,

    selfUse: {
      description:
        "Mở phong bì và nhận 500.000đ.",
      statEffect: {
        money: 500_000,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Đưa phong bì cho một người chơi khác, họ nhận 500.000đ.",
      statEffect: {
        money: 500_000,
      },
      relationshipEffect: {
        relationship: 2,
      },
      consume: true,
    },

    sidequestUse: {
      description:
        "Dùng phong bì để lần theo món nợ cũ.",
      sidequestId: "the_unpaid_debt",
      consume: true,
    },
  },

  {
    id: "small_wallet",
    category: "money",
    rarity: "common",

    name: "Ví cũ",
    name_en: "Old Wallet",

    description:
      "Một chiếc ví cũ vẫn còn một ít tiền bên trong.",
    description_en:
      "An old wallet containing a small amount of cash.",

    price: 150_000,
    icon: "👛",

    stackable: true,
    spawn_weight: 120,

    selfUse: {
      description:
        "Lấy 300.000đ trong ví.",
      statEffect: {
        money: 300_000,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Đưa ví cho người chơi khác và họ nhận 300.000đ.",
      statEffect: {
        money: 300_000,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },
  },

  {
    id: "lucky_coin",
    category: "money",
    rarity: "rare",

    name: "Đồng xu may mắn",
    name_en: "Lucky Coin",

    description:
      "Một đồng xu cũ mà người ta tin rằng đem lại may mắn.",
    description_en:
      "An old coin believed to bring good luck.",

    price: 500_000,
    icon: "🪙",

    stackable: false,
    spawn_weight: 50,

    selfUse: {
      description:
        "Giữ đồng xu để có cơ hội nhận thêm tiền trong một sự kiện ngẫu nhiên.",
      consume: false,
    },

    playerUse: {
      description:
        "Tặng đồng xu cho người chơi khác để tăng quan hệ.",
      relationshipEffect: {
        relationship: 3,
      },
      consume: false,
    },
  },

  {
    id: "sealed_package",
    category: "money",
    rarity: "rare",

    name: "Gói hàng niêm phong",
    name_en: "Sealed Package",

    description:
      "Một gói hàng không rõ bên trong chứa gì.",
    description_en:
      "A sealed package with an unknown content.",

    price: 700_000,
    icon: "📦",

    stackable: false,
    spawn_weight: 45,

    selfUse: {
      description:
        "Mở gói hàng để nhận một phần thưởng tiền ngẫu nhiên.",
      consume: true,
    },

    playerUse: {
      description:
        "Đưa gói hàng cho một người chơi khác để họ mở.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: true,
    },
  },

  /* =====================================================
     TRAVEL
  ===================================================== */

  {
    id: "old_map",
    category: "travel",
    rarity: "rare",

    name: "Bản đồ cũ",
    name_en: "Old Map",

    description:
      "Một tấm bản đồ đã bạc màu với vài tuyến đường không còn xuất hiện trên bản đồ hiện đại.",
    description_en:
      "A faded map showing routes missing from modern maps.",

    price: 600_000,
    icon: "🗺️",

    stackable: false,
    spawn_weight: 60,

    selfUse: {
      description:
        "Dùng bản đồ để giảm chi phí chuyến đi tiếp theo.",
      travelEffect: {
        travelCostReduction: 100_000,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Đưa bản đồ cho một người chơi khác để họ giảm chi phí chuyến đi.",
      travelEffect: {
        travelCostReduction: 100_000,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },

    sidequestUse: {
      description:
        "Dùng bản đồ để tìm con đường không có trên bản đồ.",
      sidequestId: "the_missing_map",
      consume: true,
    },
  },

  {
    id: "bus_ticket",
    category: "travel",
    rarity: "common",

    name: "Vé xe cũ",
    name_en: "Old Bus Ticket",

    description:
      "Một tấm vé xe vẫn còn có thể dùng.",
    description_en:
      "A bus ticket that can still be used.",

    price: 100_000,
    icon: "🎫",

    stackable: true,
    spawn_weight: 120,

    selfUse: {
      description:
        "Giảm 100.000đ cho một lần di chuyển.",
      travelEffect: {
        travelCostReduction: 100_000,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Đưa vé cho một người chơi khác để họ giảm 100.000đ chi phí di chuyển.",
      travelEffect: {
        travelCostReduction: 100_000,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },
  },

  {
    id: "compass",
    category: "travel",
    rarity: "uncommon",

    name: "La bàn",
    name_en: "Compass",

    description:
      "Một chiếc la bàn cũ giúp định hướng khi đi xa.",
    description_en:
      "An old compass that helps with navigation.",

    price: 400_000,
    icon: "🧭",

    stackable: false,
    spawn_weight: 75,

    selfUse: {
      description:
        "Giảm rủi ro khi di chuyển đến địa điểm mới.",
      travelEffect: {
        travelRiskReduction: 10,
      },
      consume: false,
    },

    playerUse: {
      description:
        "Đưa la bàn cho người chơi khác để hỗ trợ chuyến đi của họ.",
      travelEffect: {
        travelRiskReduction: 10,
      },
      relationshipEffect: {
        relationship: 1,
      },
      consume: false,
    },
  },

  {
    id: "old_key",
    category: "travel",
    rarity: "epic",

    name: "Chìa khóa cũ",
    name_en: "Old Key",

    description:
      "Một chiếc chìa khóa không rõ thuộc về cánh cửa nào.",
    description_en:
      "An old key with no obvious lock.",

    price: 900_000,
    icon: "🔑",

    stackable: false,
    spawn_weight: 30,

    selfUse: {
      description:
        "Giữ chìa khóa để mở một địa điểm bí mật khi có cơ hội.",
      consume: false,
    },

    playerUse: {
      description:
        "Trao chìa khóa cho một người chơi khác để họ có thể sử dụng nó.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },

    sidequestUse: {
      description:
        "Dùng chìa khóa để mở Căn phòng số 17.",
      sidequestId: "room_number_17",
      consume: true,
    },
  },

  /* =====================================================
     RELATIONSHIP
  ===================================================== */

  {
    id: "old_photo",
    category: "relationship",
    rarity: "uncommon",

    name: "Tấm ảnh cũ",
    name_en: "Old Photograph",

    description:
      "Một tấm ảnh cũ có thể gợi lại ký ức của một người.",
    description_en:
      "An old photograph that may trigger someone's memories.",

    price: 300_000,
    icon: "📷",

    stackable: false,
    spawn_weight: 70,

    selfUse: {
      description:
        "Giữ lại tấm ảnh để sử dụng khi gặp một NPC phù hợp.",
      relationshipEffect: {
        relationship: 1,
      },
      consume: false,
    },

    playerUse: {
      description:
        "Tặng tấm ảnh cho một người chơi khác.",
      relationshipEffect: {
        relationship: 3,
      },
      consume: true,
    },
  },

  {
    id: "coffee",
    category: "relationship",
    rarity: "common",

    name: "Cà phê",
    name_en: "Coffee",

    description:
      "Một ly cà phê nóng có thể giúp mọi người bình tĩnh lại.",
    description_en:
      "A hot coffee that can help someone calm down.",

    price: 80_000,
    icon: "☕",

    stackable: true,
    spawn_weight: 140,

    selfUse: {
      description:
        "Uống cà phê và hồi phục một chút tinh thần.",
      relationshipEffect: {
        relationship: 1,
      },
      consume: true,
    },

    playerUse: {
      description:
        "Mời một người chơi khác một ly cà phê.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: true,
    },
  },

  {
    id: "blanket",
    category: "relationship",
    rarity: "common",

    name: "Chăn mỏng",
    name_en: "Thin Blanket",

    description:
      "Một chiếc chăn cũ nhưng vẫn còn sạch.",
    description_en:
      "An old but clean blanket.",

    price: 160_000,
    icon: "🛏️",

    stackable: false,
    spawn_weight: 100,

    selfUse: {
      description:
        "Dùng chăn để nghỉ ngơi và giảm ảnh hưởng của thời tiết.",
      consume: false,
    },

    playerUse: {
      description:
        "Cho người chơi khác mượn chăn.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },
  },

  {
    id: "handmade_bracelet",
    category: "relationship",
    rarity: "rare",

    name: "Vòng tay thủ công",
    name_en: "Handmade Bracelet",

    description:
      "Một món đồ nhỏ được làm bằng tay.",
    description_en:
      "A small handmade bracelet.",

    price: 220_000,
    icon: "📿",

    stackable: false,
    spawn_weight: 55,

    selfUse: {
      description:
        "Giữ vòng tay như một kỷ vật.",
      relationshipEffect: {
        relationship: 1,
      },
      consume: false,
    },

    playerUse: {
      description:
        "Tặng vòng tay cho một người chơi khác.",
      relationshipEffect: {
        relationship: 5,
      },
      consume: true,
    },
  },

  /* =====================================================
     QUEST
  ===================================================== */

  {
    id: "old_radio",
    category: "quest",
    rarity: "epic",

    name: "Radio cũ",
    name_en: "Old Radio",

    description:
      "Một chiếc radio cũ thỉnh thoảng vẫn bắt được tín hiệu.",
    description_en:
      "An old radio that occasionally catches a signal.",

    price: 1_000_000,
    icon: "📻",

    stackable: false,
    spawn_weight: 25,

    selfUse: {
      description:
        "Nghe radio để tìm thông tin có thể hữu ích.",
      consume: false,
    },

    playerUse: {
      description:
        "Đưa radio cho một người chơi khác để họ nghe tín hiệu.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },

    sidequestUse: {
      description:
        "Dùng radio để bắt tín hiệu lúc nửa đêm.",
      sidequestId: "the_old_radio",
      consume: false,
    },
  },

  {
    id: "mysterious_letter",
    category: "quest",
    rarity: "rare",

    name: "Bức thư bí ẩn",
    name_en: "Mysterious Letter",

    description:
      "Một bức thư không ghi rõ người gửi.",
    description_en:
      "A letter with no clear sender.",

    price: 550_000,
    icon: "📜",

    stackable: false,
    spawn_weight: 35,

    selfUse: {
      description:
        "Đọc bức thư và nhận một manh mối.",
      consume: true,
    },

    playerUse: {
      description:
        "Đưa bức thư cho người chơi khác để họ đọc.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: true,
    },
  },

  {
    id: "strange_photo",
    category: "quest",
    rarity: "epic",

    name: "Bức ảnh kỳ lạ",
    name_en: "Strange Photograph",

    description:
      "Một bức ảnh chụp một địa điểm mà không ai nhận ra.",
    description_en:
      "A photograph showing a place nobody recognizes.",

    price: 750_000,
    icon: "🖼️",

    stackable: false,
    spawn_weight: 20,

    selfUse: {
      description:
        "Giữ bức ảnh để nhận manh mối khi gặp địa điểm phù hợp.",
      consume: false,
    },

    playerUse: {
      description:
        "Đưa bức ảnh cho người chơi khác để họ tìm hiểu.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },
  },

  {
    id: "broken_watch",
    category: "quest",
    rarity: "rare",

    name: "Đồng hồ hỏng",
    name_en: "Broken Watch",

    description:
      "Một chiếc đồng hồ dừng lại ở một thời điểm kỳ lạ.",
    description_en:
      "A broken watch stopped at a strange time.",

    price: 480_000,
    icon: "⌚",

    stackable: false,
    spawn_weight: 30,

    selfUse: {
      description:
        "Giữ đồng hồ để sử dụng khi gặp một sự kiện liên quan đến thời gian.",
      consume: false,
    },

    playerUse: {
      description:
        "Đưa đồng hồ cho người chơi khác để họ giữ manh mối.",
      relationshipEffect: {
        relationship: 2,
      },
      consume: false,
    },
  },
];

/* =========================================================
   HELPERS
========================================================= */

/**
 * Lấy một item theo ID.
 */
export function getGameItem(
  itemId: string,
): ItemDefinition | undefined {
  return ITEMS.find(
    (item) => item.id === itemId,
  );
}

/**
 * Lấy một Sidequest theo ID.
 */
export function getSidequest(
  sidequestId: string,
): SidequestDefinition | undefined {
  return SIDEQUESTS.find(
    (quest) => quest.id === sidequestId,
  );
}

/**
 * Lấy toàn bộ item theo category.
 */
export function getItemsByCategory(
  category: ItemDefinition["category"],
): ItemDefinition[] {
  return ITEMS.filter(
    (item) => item.category === category,
  );
}

/**
 * Kiểm tra item có chức năng mở Sidequest không.
 */
export function hasSidequestUse(
  item: ItemDefinition,
): boolean {
  return Boolean(item.sidequestUse);
}