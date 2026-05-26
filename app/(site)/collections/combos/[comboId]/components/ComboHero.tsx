"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IoCheckmark, IoChevronForward } from "react-icons/io5";
import { FaWhatsapp, FaTruckFast, FaArrowRotateLeft } from "react-icons/fa6";
import toast from "react-hot-toast";
import { Button } from "antd";

import { AppDispatch, RootState } from "@/redux/store";
import { addMultipleToBag } from "@/redux/bagSlice/bagSlice";
import { ComboProduct, ComboItem } from "@/interfaces/ComboProduct";
import { BagItem, VariantMode } from "@/interfaces/BagItem";
import SizeGrid from "@/components/SizeGrid";
import axiosInstance from "@/actions/axiosInstance";

// --- Types ---
interface PopulatedComboItem extends ComboItem {
  product: {
    id: string;
    name: string;
    thumbnail: { url: string };
    sellingPrice: number;
    marketPrice: number;
    buyingPrice: number;
    discount: number;
    variants: {
      variantId: string;
      variantName: string;
      images: { url: string }[];
      sizes: string[];
    }[];
  } | null;
  variant?: {
    variantId: string;
    variantName: string;
    images: { url: string }[];
    sizes: string[];
  } | null;
}

interface PopulatedCombo extends Omit<ComboProduct, "items"> {
  items: PopulatedComboItem[];
}

interface ComboSlot {
  slotId: string;
  itemIndex: number;
  unitIndex: number;
  productId: string;
  product: PopulatedComboItem["product"];
  variant: PopulatedComboItem["variant"];
  required: boolean;
  isFreeUnit: boolean;
  label: string;
  variantMode: VariantMode;
  variantIds?: string[];
}

interface SlotSelection {
  slotId: string;
  variantId: string;
  size: string;
  isValid: boolean;
}

interface ComboHeroProps {
  combo: PopulatedCombo;
}

const ComboHero: React.FC<ComboHeroProps> = ({ combo }) => {
  const dispatch: AppDispatch = useDispatch();
  const router = useRouter();
  const bagItems = useSelector((state: RootState) => state.bag.bag);
  const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  const getBagQty = (productId: string, variantId: string, size: string) => {
    return (
      bagItems.find(
        (b) =>
          b.itemId === productId &&
          b.variantId === variantId &&
          b.size === size,
      )?.quantity || 0
    );
  };

  // --- Logic: Expand Items to Slots ---
  const slots = useMemo<ComboSlot[]>(() => {
    const result: ComboSlot[] = [];

    combo.items.forEach((item, itemIndex) => {
      if (!item.product) return;
      const quantity = item.quantity || 1;

      for (let unitIndex = 0; unitIndex < quantity; unitIndex++) {
        const slotId = `${item.productId}-${itemIndex}-${unitIndex}`;
        let isFreeUnit = false;
        let label = item.product.name;

        if (combo.type === "BOGO") {
          const buyQty = combo.buyQuantity || 1;
          const totalUnitsBeforeThis = result.length;
          if (totalUnitsBeforeThis >= buyQty) {
            isFreeUnit = true;
            label = `${item.product.name} (FREE)`;
          }
        } else if (quantity > 1) {
          label = `${item.product.name} #${unitIndex + 1}`;
        }

        result.push({
          slotId,
          itemIndex,
          unitIndex,
          productId: item.productId,
          product: item.product,
          variant: item.variant,
          required: item.required,
          isFreeUnit,
          label,
          variantMode: item.variantMode || "ALL_VARIANTS",
          variantIds: item.variantIds,
        });
      }
    });
    return result;
  }, [combo.items, combo.type, combo.buyQuantity]);

  // --- State ---
  const [selections, setSelections] = useState<Record<string, SlotSelection>>(
    {},
  );
  const [stockStatus, setStockStatus] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState<Record<string, boolean>>({});
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  // --- Logic: Initialize ---
  useEffect(() => {
    const initialSelections: Record<string, SlotSelection> = {};
    slots.forEach((slot) => {
      if (slot.product) {
        const allowedVariants =
          slot.variantMode === "SPECIFIC_VARIANTS" && slot.variantIds?.length
            ? slot.product.variants.filter((v) =>
                slot.variantIds!.includes(v.variantId),
              )
            : slot.product.variants;

        const variant = slot.variant || allowedVariants?.[0];
        initialSelections[slot.slotId] = {
          slotId: slot.slotId,
          variantId: variant?.variantId || "",
          size: "",
          isValid: false,
        };
      }
    });
    setSelections(initialSelections);
  }, [slots]);

  // --- Logic: Stock Checking ---
  const checkStock = async (
    slotId: string,
    productId: string,
    variantId: string,
    size: string,
  ) => {
    const key = `${slotId}-${variantId}-${size}`;
    if (stockStatus[key] !== undefined) return;

    setStockLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await axiosInstance.get(
        `/web/inventory?productId=${productId}&variantId=${variantId}&size=${size}`,
      );
      const data = res.data;
      setStockStatus((prev) => ({ ...prev, [key]: data.quantity || 0 }));
    } catch {
      setStockStatus((prev) => ({ ...prev, [key]: 0 }));
    } finally {
      setStockLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const preloadStockForSlot = async (slot: ComboSlot, variantId: string) => {
    if (!slot.product) return;
    const variant = slot.product.variants.find(
      (v) => v.variantId === variantId,
    );
    if (!variant?.sizes) return;
    await Promise.all(
      variant.sizes.map((size) =>
        checkStock(slot.slotId, slot.productId, variantId, size),
      ),
    );
  };

  useEffect(() => {
    const slot = slots[activeSlotIndex];
    const selection = selections[slot?.slotId];
    if (slot && selection?.variantId) {
      preloadStockForSlot(slot, selection.variantId);
    }
  }, [activeSlotIndex, selections, slots]);

  const getStockForSize = (slotId: string, variantId: string, size: string) => {
    const key = `${slotId}-${variantId}-${size}`;
    const quantity = stockStatus[key];
    const loading = stockLoading[key];
    const isOutOfStock = quantity !== undefined && quantity <= 0;

    return { quantity, loading, isOutOfStock };
  };

  const getStockForSlot = (slotId: string) => {
    const selection = selections[slotId];
    if (!selection?.size) return null;
    const key = `${slotId}-${selection.variantId}-${selection.size}`;
    return {
      quantity: stockStatus[key],
      loading: stockLoading[key],
    };
  };

  // --- Handlers ---
  const handleSizeSelect = (slotId: string, size: string) => {
    const selection = selections[slotId];
    const slot = slots.find((s) => s.slotId === slotId);
    if (!selection || !slot) return;

    const stockInfo = getStockForSize(slotId, selection.variantId, size);
    if (stockInfo.isOutOfStock) {
      toast.error(`Size ${size} is out of stock`);
      return;
    }

    const bagQty = getBagQty(slot.productId, selection.variantId, size);
    if (stockInfo.quantity !== undefined && bagQty + 1 > stockInfo.quantity) {
      toast.error(
        `Limit reached! You have ${bagQty} in bag and only ${stockInfo.quantity} available.`,
      );
    }

    setSelections((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], size, isValid: true },
    }));
  };

  const handleVariantSelect = (slotId: string, variantId: string) => {
    const slot = slots.find((s) => s.slotId === slotId);
    setSelections((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], variantId, size: "", isValid: false },
    }));
    if (slot) preloadStockForSlot(slot, variantId);
  };

  const allSelectionsValid = slots.every((slot) => {
    if (!slot.required) return true;
    return selections[slot.slotId]?.isValid;
  });

  const handleAddToBag = () => {
    if (!allSelectionsValid) {
      toast.error("Please select sizes for all items");
      return;
    }

    for (const slot of slots) {
      if (!slot.product) continue;
      const selection = selections[slot.slotId];
      if (!selection?.isValid && slot.required) {
        toast.error(`Please select a size for ${slot.label}`);
        return;
      }
      if (!selection?.isValid) continue;

      const stockKey = `${slot.slotId}-${selection.variantId}-${selection.size}`;
      const stockQty = stockStatus[stockKey];
      const bagQty = getBagQty(
        slot.productId,
        selection.variantId,
        selection.size,
      );

      if (stockQty !== undefined && bagQty + 1 > stockQty) {
        toast.error(
          `Cannot add bundle: "${slot.product.name}" (${selection.size}) limit reached.`,
        );
        return;
      }
    }

    const bagItemsToAdd: BagItem[] = [];
    const totalSlots = slots.length;

    slots.forEach((slot) => {
      if (!slot.product) return;
      const selection = selections[slot.slotId];
      if (!selection?.isValid && slot.required) return;
      if (!selection.isValid) return;

      const variant = slot.product.variants.find(
        (v) => v.variantId === selection.variantId,
      );

      const slotOriginalPrice = slot.product.sellingPrice;
      const slotComboPrice = combo.comboPrice / totalSlots;
      const slotDiscount = slotOriginalPrice - slotComboPrice;

      bagItemsToAdd.push({
        itemId: slot.productId,
        variantId: selection.variantId,
        size: selection.size,
        quantity: 1,
        price: slot.product.sellingPrice,
        bPrice: 0,
        name: slot.product.name,
        thumbnail:
          variant?.images?.[0]?.url || slot.product.thumbnail?.url || "",
        discount: Math.round(slotDiscount),
        itemType: "combo",
        maxQuantity: 10,
        comboId: combo.id,
        comboName: combo.name,
        isComboItem: true,
      });
    });

    dispatch(addMultipleToBag(bagItemsToAdd));
    toast.success("Combo added to bag!");
  };

  const handleBuyNow = () => {
    handleAddToBag();
    router.push("/checkout");
  };

  const pricing = useMemo(() => {
    if (combo.type === "BOGO" && combo.buyQuantity && combo.getQuantity) {
      return {
        label: `Buy ${combo.buyQuantity}, Get ${combo.getQuantity} ${
          combo.getDiscount === 100 ? "FREE" : `at ${combo.getDiscount}% off`
        }`,
        savings: combo.savings,
      };
    }
    return { label: "Bundle Price", savings: combo.savings };
  }, [combo]);

  const activeSlot = slots[activeSlotIndex];
  const activeProduct = activeSlot?.product;
  const activeSelection = selections[activeSlot?.slotId];
  const activeVariant = activeProduct?.variants.find(
    (v) => v.variantId === activeSelection?.variantId,
  );

  // Build sizeStock map for SizeGrid compatibility
  const activeSizeStock = useMemo(() => {
    if (!activeSlot || !activeSelection?.variantId || !activeVariant?.sizes)
      return {};
    const map: Record<string, number> = {};
    activeVariant.sizes.forEach((size) => {
      const key = `${activeSlot.slotId}-${activeSelection.variantId}-${size}`;
      map[size] = stockStatus[key] ?? -1; // -1 means loading
    });
    return map;
  }, [activeSlot, activeSelection, activeVariant, stockStatus]);

  const isStockLoading = useMemo(() => {
    if (!activeSlot || !activeSelection?.variantId || !activeVariant?.sizes)
      return false;
    return activeVariant.sizes.some((size) => {
      const key = `${activeSlot.slotId}-${activeSelection.variantId}-${size}`;
      return stockLoading[key];
    });
  }, [activeSlot, activeSelection, activeVariant, stockLoading]);

  return (
    <section className="max-w-content mx-auto px-4 md:px-10 py-6 flex flex-col lg:flex-row gap-10 lg:gap-16">
      {/* --- LEFT: VISUALS --- */}
      <div className="flex-1 lg:w-3/5 flex flex-col gap-4">
        {/* Main Image */}
        <div className="relative aspect-square bg-surface-2 rounded-sm overflow-hidden group">
          <AnimatePresence mode="wait">
            <motion.div
              key={
                activeVariant?.images?.[0]?.url || activeProduct?.thumbnail?.url
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              {activeProduct?.thumbnail?.url ||
              activeVariant?.images?.[0]?.url ? (
                <Image
                  src={
                    activeVariant?.images?.[0]?.url ||
                    activeProduct?.thumbnail?.url ||
                    ""
                  }
                  alt={activeProduct?.name || "Bundle Item"}
                  fill
                  priority
                  className="object-cover mix-blend-multiply"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-8xl grayscale opacity-20">📦</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Tags */}
          <div className="absolute top-0 left-0 flex flex-col">
            <span className="bg-dark text-inverse px-4 py-2 text-[10px] font-black uppercase tracking-widest">
              {combo.type === "BOGO" ? "Buy 1 Get 1" : "Bundle Deal"}
            </span>
          </div>

          <div className="absolute top-0 right-0 bg-success text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest">
            Save Rs. {combo.savings.toLocaleString()}
          </div>

          {activeSlot?.isFreeUnit && (
            <div className="absolute bottom-0 left-0 bg-accent text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest animate-pulse">
              Free Item
            </div>
          )}
        </div>

        {/* Slot Thumbnails */}
        <div className="grid grid-cols-4 gap-2">
          {slots.map((slot, idx) => {
            const isActive = idx === activeSlotIndex;
            const selection = selections[slot.slotId];
            const hasSize = selection?.isValid;

            return (
              <Button
                type="text"
                key={slot.slotId}
                onClick={() => setActiveSlotIndex(idx)}
                className={`relative aspect-square bg-surface-2 border-2 rounded-sm transition-all p-0 h-auto ${
                  isActive
                    ? "border-dark hover:border-dark focus:border-dark"
                    : "border-transparent hover:border-border-primary hover:opacity-100"
                } ${slot.isFreeUnit ? "ring-2 ring-accent ring-offset-2" : ""}`}
              >
                {slot.product?.thumbnail?.url && (
                  <Image
                    src={slot.product.thumbnail.url}
                    alt=""
                    fill
                    className="object-cover mix-blend-multiply"
                  />
                )}

                {combo.items.length > 1 && (
                  <div className="absolute top-0 left-0 bg-dark text-inverse text-[9px] font-bold px-1.5 py-0.5">
                    #{idx + 1}
                  </div>
                )}

                {slot.isFreeUnit && (
                  <div className="absolute bottom-0 left-0 right-0 bg-accent text-white text-[8px] font-bold uppercase text-center py-0.5">
                    Free
                  </div>
                )}

                {hasSize && (
                  <div className="absolute top-0 right-0 bg-success text-inverse p-0.5">
                    <IoCheckmark size={12} />
                  </div>
                )}

                {slot.required && !hasSize && !isActive && (
                  <div className="absolute top-0 right-0 bg-error w-2 h-2" />
                )}
              </Button>
            );
          })}
        </div>

        {/* Desktop List View */}
        <div className="hidden lg:block border-t border-default pt-6">
          <h3 className="font-black uppercase tracking-widest text-xs text-primary-dark mb-4">
            Configuration ({slots.length} Items)
          </h3>
          <div className="space-y-1">
            {slots.map((slot, idx) => (
              <div
                key={slot.slotId}
                onClick={() => setActiveSlotIndex(idx)}
                className={`flex items-center gap-4 p-3 border cursor-pointer transition-colors rounded-sm ${
                  idx === activeSlotIndex
                    ? "bg-dark text-inverse border-dark"
                    : "bg-surface text-primary-dark border-default hover:border-border-dark"
                }`}
              >
                <div className="w-10 h-10 relative bg-surface border border-default rounded-sm overflow-hidden">
                  {slot.product?.thumbnail?.url && (
                    <Image
                      src={slot.product.thumbnail.url}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm uppercase truncate">
                      {slot.label}
                    </span>
                    {slot.isFreeUnit && (
                      <span className="text-[9px] bg-accent text-white px-1 font-bold uppercase">
                        Free
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[10px] uppercase font-medium ${
                      idx === activeSlotIndex ? "text-muted" : "text-muted"
                    }`}
                  >
                    {selections[slot.slotId]?.isValid
                      ? `Selected: ${selections[slot.slotId].size}`
                      : "Select Size"}
                  </p>
                </div>
                {selections[slot.slotId]?.isValid && (
                  <IoCheckmark className="text-success" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- RIGHT: ACTIONS --- */}
      <div className="lg:w-2/5 relative">
        <div className="sticky top-24 flex flex-col gap-6">
          {/* Header */}
          <header>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-widest bg-dark text-inverse px-2 py-0.5 uppercase">
                {pricing.label}
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter text-primary-dark leading-[0.9]">
              {combo.name}
            </h1>

            {combo.description && (
              <p className="text-muted font-medium text-sm mt-4 uppercase tracking-wide leading-relaxed">
                {combo.description}
              </p>
            )}

            <div className="flex flex-wrap items-baseline gap-3 mt-6">
              <span className="text-4xl font-display font-black tracking-tighter text-primary-dark">
                Rs. {combo.comboPrice.toLocaleString()}
              </span>
              <span className="text-xl font-bold text-muted line-through">
                Rs. {combo.originalPrice.toLocaleString()}
              </span>
              <span className="bg-success text-white text-[10px] font-black px-3 py-1 uppercase tracking-widest">
                Save Rs. {pricing.savings.toLocaleString()}
              </span>
            </div>

            {/* Value Props */}
            <div className="flex gap-4 mt-6 border-y border-default py-3">
              <div className="flex items-center gap-2">
                <FaTruckFast className="text-muted" size={14} />
                <span className="text-[10px] font-bold uppercase text-primary-dark">
                  Standard Shipping 2-3 Days
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FaArrowRotateLeft className="text-muted" size={14} />
                <span className="text-[10px] font-bold uppercase text-primary-dark">
                  Size Exchange
                </span>
              </div>
            </div>
          </header>

          {/* Active Slot Controller */}
          {activeSlot && activeProduct && (
            <div
              className={`border p-5 rounded-sm ${
                activeSlot.isFreeUnit
                  ? "border-accent bg-accent/5"
                  : "border-default bg-surface"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1">
                    Selection {activeSlotIndex + 1} of {slots.length}
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-wide text-primary-dark">
                    {activeProduct.name}
                  </h3>
                </div>
                {/* Variant Swatches */}
                {(() => {
                  const allowedVariants =
                    activeSlot.variantMode === "SPECIFIC_VARIANTS" &&
                    activeSlot.variantIds?.length
                      ? activeProduct.variants.filter((v) =>
                          activeSlot.variantIds!.includes(v.variantId),
                        )
                      : activeProduct.variants;

                  if (allowedVariants.length <= 1) return null;

                  return (
                    <div className="flex gap-1">
                      {allowedVariants.map((v) => (
                        <Button
                          type="text"
                          key={v.variantId}
                          onClick={() =>
                            handleVariantSelect(activeSlot.slotId, v.variantId)
                          }
                          className={`w-10 h-10 border-2 rounded-sm overflow-hidden p-0 hover:bg-surface-2 focus:bg-surface-2 ${
                            activeSelection?.variantId === v.variantId
                              ? "border-dark hover:border-dark focus:border-dark"
                              : "border-default"
                          }`}
                        >
                          <Image
                            src={v.images?.[0]?.url || ""}
                            alt=""
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        </Button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Size Grid */}
              {activeVariant?.sizes && activeVariant.sizes.length > 0 ? (
                <SizeGrid
                  sizes={activeVariant.sizes}
                  selectedSize={activeSelection?.size || ""}
                  onSelectSize={(size) =>
                    handleSizeSelect(activeSlot.slotId, size)
                  }
                  stockMap={activeSizeStock}
                  stockLoading={isStockLoading}
                />
              ) : (
                <p className="text-xs text-error font-bold uppercase">
                  Please select a color
                </p>
              )}

              {/* Stock Status */}
              {activeSelection?.size && (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-widest">
                  {(() => {
                    const stock = getStockForSlot(activeSlot.slotId);
                    const bagQty = getBagQty(
                      activeSlot.productId,
                      activeSelection.variantId,
                      activeSelection.size,
                    );

                    if (stock?.quantity !== undefined) {
                      if (stock.quantity <= 0)
                        return <span className="text-error">Sold Out</span>;

                      if (bagQty + 1 > stock.quantity) {
                        return (
                          <span className="text-warning">
                            Limit Reached ({bagQty} in bag)
                          </span>
                        );
                      }

                      return (
                        <span className="text-success">
                          {stock.quantity} In Stock
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Next Button */}
              {activeSlotIndex < slots.length - 1 &&
                activeSelection?.isValid && (
                  <Button
                    type="default"
                    onClick={() => setActiveSlotIndex(activeSlotIndex + 1)}
                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-surface-2 hover:bg-dark hover:text-inverse text-primary-dark text-xs font-bold uppercase tracking-widest rounded-full transition-colors h-auto border-none shadow-none"
                    iconPosition="end"
                    icon={<IoChevronForward />}
                  >
                    Next Item
                  </Button>
                )}
            </div>
          )}

          {/* Progress Bar */}
          <div className="w-full bg-surface-2 h-1 rounded-full overflow-hidden">
            <div
              className="bg-accent h-1 transition-all duration-300"
              style={{
                width: `${
                  (slots.filter((s) => selections[s.slotId]?.isValid).length /
                    slots.length) *
                  100
                }%`,
              }}
            />
          </div>

          {/* Main Actions */}
          <div className="space-y-3">
            <Button
              type="primary"
              onClick={handleAddToBag}
              disabled={!allSelectionsValid}
              className="w-full py-5 h-auto bg-dark text-inverse rounded-full font-display font-black uppercase tracking-widest text-xs hover:bg-accent hover:text-dark transition-all active:scale-95 disabled:bg-surface-3 disabled:text-muted disabled:cursor-not-allowed border-none"
            >
              {allSelectionsValid ? "Add Bundle to Bag" : "Complete Selection"}
            </Button>

            <Button
              type="default"
              onClick={handleBuyNow}
              disabled={!allSelectionsValid}
              className="w-full py-5 h-auto border-2 border-dark text-primary-dark rounded-full font-display font-black uppercase tracking-widest text-xs hover:bg-dark hover:text-inverse transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-transparent"
            >
              Buy Now
            </Button>

            <div className="flex justify-center pt-2">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=Help with ${combo.name}`}
                target="_blank"
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted hover:text-success transition-colors"
              >
                <FaWhatsapp size={14} /> Need sizing help? Chat with us
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ComboHero;
