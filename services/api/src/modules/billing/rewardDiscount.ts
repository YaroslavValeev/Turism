/**
 * Расчёт скидки по UGC-reward (Model A).
 *
 * Model A: скидка уменьшает цену пользователя (гость платит finalAmount);
 * комиссия платформы автоматически считается от finalAmount, т.к. billing-движок
 * работает с paidAmountRub, а гость платит именно finalAmount.
 *
 * Правила округления:
 *  - percent: floor(original * pct / 100). Скидка не превышает заявленную —
 *    «выгодно платформе», но гость теряет максимум 1₽ от формулы.
 *  - amount: floor(value). Отрицательные и дробные отбрасываем.
 *  - clamp: discount <= original. final = max(0, original - discount).
 *  - ниже min_order: скидка не применяется (`applied=false`, reason=below_min_order`).
 *  - все суммы — целые рубли (int). Копеек в системе нет.
 */

export type RewardValueType = "percent" | "amount" | string;

export type RewardInput = {
  valueType: RewardValueType;
  value: number;
  currency?: string | null;
};

export type RewardDiscountInput = {
  originalAmountRub: number;
  reward: RewardInput;
  minOrderRub?: number;
};

export type RewardDiscountResult = {
  originalAmountRub: number;
  discountAmountRub: number;
  finalAmountRub: number;
  applied: boolean;
  reason?: "zero_original" | "below_min_order" | "invalid_type" | "zero_discount";
};

export function computeRewardDiscount(input: RewardDiscountInput): RewardDiscountResult {
  const original = Math.max(0, Math.floor(Number(input.originalAmountRub) || 0));
  if (original <= 0) {
    return {
      originalAmountRub: 0,
      discountAmountRub: 0,
      finalAmountRub: 0,
      applied: false,
      reason: "zero_original",
    };
  }

  const minOrder = Math.max(0, Math.floor(input.minOrderRub ?? 0));
  if (original < minOrder) {
    return {
      originalAmountRub: original,
      discountAmountRub: 0,
      finalAmountRub: original,
      applied: false,
      reason: "below_min_order",
    };
  }

  let raw = 0;
  if (input.reward.valueType === "percent") {
    const pct = Math.max(0, Math.min(100, Math.floor(input.reward.value)));
    raw = Math.floor((original * pct) / 100);
  } else if (input.reward.valueType === "amount") {
    raw = Math.max(0, Math.floor(input.reward.value));
  } else {
    return {
      originalAmountRub: original,
      discountAmountRub: 0,
      finalAmountRub: original,
      applied: false,
      reason: "invalid_type",
    };
  }

  const discount = Math.max(0, Math.min(raw, original));
  if (discount <= 0) {
    return {
      originalAmountRub: original,
      discountAmountRub: 0,
      finalAmountRub: original,
      applied: false,
      reason: "zero_discount",
    };
  }

  const final = Math.max(0, original - discount);
  return {
    originalAmountRub: original,
    discountAmountRub: discount,
    finalAmountRub: final,
    applied: true,
  };
}
