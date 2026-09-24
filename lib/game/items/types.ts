/* =========================================================
   ITEM SYSTEM TYPES
   Đường Biên Đêm
========================================================= */

/**
 * Nhóm item.
 */
export type ItemCategory =
  | "survival"
  | "money"
  | "travel"
  | "relationship"
  | "quest";

/**
 * Độ hiếm item.
 */
export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

/**
 * Ba chức năng độc lập của item.
 *
 * self       = dùng cho bản thân
 * player     = dùng cho người chơi khác
 * sidequest  = dùng để mở / kích hoạt Sidequest
 */
export type ItemUseTarget =
  | "self"
  | "player"
  | "sidequest";

/* =========================================================
   EFFECT TYPES
========================================================= */

/**
 * Hiệu ứng thay đổi chỉ số người chơi.
 *
 * Chỉ khai báo những stat mà item thực sự thay đổi.
 */
export type ItemStatEffect = {
  hp?: number;
  money?: number;
  legalRisk?: number;
};

/**
 * Hiệu ứng liên quan đến di chuyển.
 */
export type ItemTravelEffect = {
  /**
   * Địa điểm được mở / cho phép tiếp cận.
   */
  locationId?: string;

  /**
   * Giảm chi phí di chuyển.
   */
  travelCostReduction?: number;

  /**
   * Giảm rủi ro khi di chuyển.
   */
  travelRiskReduction?: number;
};

/**
 * Hiệu ứng quan hệ.
 */
export type ItemRelationshipEffect = {
  relationship?: number;
};

/* =========================================================
   SELF USE
========================================================= */

/**
 * Chức năng:
 *
 * 🧍 Dùng item cho chính mình.
 */
export type ItemSelfUse = {
  /**
   * Mô tả hành động khi dùng cho bản thân.
   */
  description: string;

  /**
   * Thay đổi HP / tiền / legal risk.
   */
  statEffect?: ItemStatEffect;

  /**
   * Hiệu ứng di chuyển.
   */
  travelEffect?: ItemTravelEffect;

  /**
   * Hiệu ứng quan hệ.
   */
  relationshipEffect?: ItemRelationshipEffect;

  /**
   * Item có bị tiêu hao hay không.
   */
  consume: boolean;
};

/* =========================================================
   PLAYER USE
========================================================= */

/**
 * Chức năng:
 *
 * 🤝 Dùng item cho MỘT NGƯỜI CHƠI KHÁC.
 *
 * Người dùng item và người nhận hiệu ứng
 * là hai player khác nhau.
 */
export type ItemPlayerUse = {
  /**
   * Mô tả hành động.
   */
  description: string;

  /**
   * Thay đổi chỉ số của người chơi được chọn.
   */
  statEffect?: ItemStatEffect;

  /**
   * Hiệu ứng di chuyển cho người chơi được chọn.
   */
  travelEffect?: ItemTravelEffect;

  /**
   * Hiệu ứng quan hệ.
   *
   * Có thể dùng để tăng quan hệ giữa hai người.
   */
  relationshipEffect?: ItemRelationshipEffect;

  /**
   * Item có bị tiêu hao hay không.
   */
  consume: boolean;
};

/* =========================================================
   SIDEQUEST USE
========================================================= */

/**
 * Chức năng:
 *
 * 📜 Dùng item để mở / kích hoạt Sidequest.
 *
 * Đây là chức năng ĐỘC LẬP với self-use
 * và player-use.
 */
export type ItemSidequestUse = {
  /**
   * Mô tả hành động mở Sidequest.
   */
  description: string;

  /**
   * ID của Sidequest được kích hoạt.
   */
  sidequestId: string;

  /**
   * Item có bị tiêu hao khi kích hoạt Sidequest.
   */
  consume: boolean;
};

/* =========================================================
   ITEM DEFINITION
========================================================= */

/**
 * Định nghĩa gameplay hoàn chỉnh của một item.
 *
 * LƯU Ý:
 *
 * item_definitions trong Supabase vẫn chịu trách nhiệm
 * cho thông tin cơ bản:
 *
 * - id
 * - name
 * - price
 * - icon
 * - category
 * - ...
 *
 * File này bổ sung gameplay:
 *
 * - selfUse
 * - playerUse
 * - sidequestUse
 */
export type ItemDefinition = {
  /**
   * ID phải khớp với:
   *
   * item_definitions.id
   */
  id: string;

  /**
   * Nhóm item.
   */
  category: ItemCategory;

  /**
   * Độ hiếm.
   */
  rarity: ItemRarity;

  /**
   * Tên tiếng Việt.
   */
  name: string;

  /**
   * Tên tiếng Anh.
   */
  name_en: string;

  /**
   * Mô tả tiếng Việt.
   */
  description: string;

  /**
   * Mô tả tiếng Anh.
   */
  description_en: string;

  /**
   * Giá mua trong Shop.
   */
  price: number;

  /**
   * Icon / emoji / icon key.
   */
  icon: string;

  /**
   * Có thể cộng số lượng hay không.
   */
  stackable: boolean;

  /**
   * Trọng số xuất hiện trong Shop
   * hoặc random reward.
   */
  spawn_weight: number;

  /**
   * =====================================================
   * CHỨC NĂNG 1
   * =====================================================
   *
   * 🧍 Dùng cho bản thân.
   */
  selfUse: ItemSelfUse;

  /**
   * =====================================================
   * CHỨC NĂNG 2
   * =====================================================
   *
   * 🤝 Dùng cho người chơi khác.
   *
   * Không phải chính mình.
   */
  playerUse: ItemPlayerUse;

  /**
   * =====================================================
   * CHỨC NĂNG 3
   * =====================================================
   *
   * 📜 Mở / kích hoạt Sidequest.
   *
   * Một số item có thể không có Sidequest,
   * nên field này là optional.
   */
  sidequestUse?: ItemSidequestUse;
};

/* =========================================================
   USE CONTEXT
========================================================= */

/**
 * Context chung khi sử dụng item.
 */
export type ItemUseContext = {
  /**
   * Room hiện tại.
   */
  roomId: string;

  /**
   * Player đang sử dụng item.
   */
  playerId: string;

  /**
   * Player được nhận hiệu ứng.
   *
   * Chỉ bắt buộc khi:
   *
   * target === "player"
   */
  targetPlayerId?: string;

  /**
   * Round hiện tại.
   */
  round?: number;

  /**
   * Nguồn gọi.
   *
   * Ví dụ:
   *
   * "inventory"
   * "shop"
   * "event"
   * "sidequest"
   * "admin"
   */
  source?: string;

  /**
   * ID tham chiếu.
   *
   * Ví dụ:
   *
   * eventId
   * sidequestId
   * roundEventId
   */
  referenceId?: string | null;
};

/* =========================================================
   USE INPUT
========================================================= */

/**
 * Input chuẩn cho useItem().
 */
export type UseItemInput = {
  /**
   * Item muốn sử dụng.
   */
  itemId: string;

  /**
   * Một trong 3 chức năng:
   *
   * self
   * player
   * sidequest
   */
  target: ItemUseTarget;

  /**
   * Người chơi nhận hiệu ứng.
   *
   * BẮT BUỘC nếu:
   *
   * target === "player"
   *
   * Không cần nếu:
   *
   * target === "self"
   * target === "sidequest"
   */
  targetPlayerId?: string;

  /**
   * Room hiện tại.
   */
  roomId: string;

  /**
   * Người sử dụng item.
   */
  playerId: string;

  /**
   * Round hiện tại.
   */
  round?: number;

  /**
   * Nguồn gọi.
   */
  source?: string;

  /**
   * ID tham chiếu.
   */
  referenceId?: string | null;
};

/* =========================================================
   USE RESULT
========================================================= */

/**
 * Kết quả sau khi sử dụng item.
 */
export type ItemUseResult = {
  /**
   * Có thực hiện thành công không.
   */
  success: boolean;

  /**
   * Item đã sử dụng.
   */
  itemId: string;

  /**
   * Chức năng đã sử dụng.
   */
  target: ItemUseTarget;

  /**
   * Player sử dụng item.
   */
  playerId: string;

  /**
   * Player nhận hiệu ứng.
   *
   * Với self:
   *   = playerId
   *
   * Với player:
   *   = targetPlayerId
   *
   * Với sidequest:
   *   = undefined
   */
  targetPlayerId?: string;

  /**
   * Item có bị tiêu hao không.
   */
  consumed: boolean;

  /**
   * Sidequest được mở.
   *
   * Chỉ xuất hiện khi:
   *
   * target === "sidequest"
   */
  sidequestId?: string;

  /**
   * Stat thay đổi.
   */
  statEffect?: ItemStatEffect;

  /**
   * Travel effect.
   */
  travelEffect?: ItemTravelEffect;

  /**
   * Relationship effect.
   */
  relationshipEffect?: ItemRelationshipEffect;

  /**
   * Thông báo cho UI / game log.
   */
  message: string;
};

/* =========================================================
   SIDEQUEST DEFINITION
========================================================= */

/**
 * Định nghĩa một Sidequest.
 */
export type SidequestDefinition = {
  /**
   * ID duy nhất.
   */
  id: string;

  /**
   * Tên tiếng Việt.
   */
  name: string;

  /**
   * Tên tiếng Anh.
   */
  name_en: string;

  /**
   * Mô tả tiếng Việt.
   */
  description: string;

  /**
   * Mô tả tiếng Anh.
   */
  description_en: string;

  /**
   * Item có thể kích hoạt quest.
   */
  triggerItemId: string;

  /**
   * Quest có thể kích hoạt nhiều lần hay không.
   */
  repeatable: boolean;
};