"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { IoClose, IoAdd, IoRemove, IoFlash } from "react-icons/io5";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Button } from "antd";

import { AppDispatch, RootState } from "@/redux/store";
import { addToBag } from "@/redux/bagSlice/bagSlice";
import { Product } from "@/interfaces/Product";
import { ProductVariant } from "@/interfaces/ProductVariant";
import { usePromotionsContext } from "@/components/PromotionsProvider";
import {
  ProductVariantTarget,
  PromotionCondition,
} from "@/interfaces/Promotion";
import { isVariantEligibleForPromotion } from "@/utils/promotionUtils";
import {
  calculateFinalPrice,
  getOriginalPrice,
  hasDiscount as checkHasDiscount,
} from "@/utils/pricing";
import SizeGrid from "@/components/SizeGrid";
import axiosInstance from "@/actions/axiosInstance";

interface QuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const dispatch: AppDispatch = useDispatch();
  const bagItems = useSelector((state: RootState) => state.bag.bag);
  const { getPromotionForProduct } = usePromotionsContext();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    null,
  );
  const [selectedSize, setSelectedSize] = useState("");
  const [qty, setQty] = useState(1);
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);
  // Track stock for ALL variants (variantId -> total stock)
  const [allVariantStock, setAllVariantStock] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (product) {
      const defaultVariant = product.variants?.[0] || null;
      setSelectedVariant(defaultVariant);
      setSelectedSize("");
      setQty(1);
      setSizeStock({});
      setAllVariantStock({});
    }
  }, [product]);

  // Preload stock for ALL variants when modal opens
  useEffect(() => {
    if (!product || !isOpen || !product.variants?.length) return;

    const loadAllVariantStock = async () => {
      const stockMap: Record<string, number> = {};

      // Fetch stock for each variant in parallel
      const promises = product.variants.map(async (variant) => {
        if (!variant.sizes?.length) {
          stockMap[variant.variantId] = 0;
          return;
        }

        try {
          const res = await axiosInstance.get(
            `/web/inventory/batch?productId=${product.id}&variantId=${
              variant.variantId
            }&sizes=${variant.sizes.join(",")}`,
          );
          const data = res.data;
          // Sum up total stock for this variant
          const totalStock = Object.values(data.stock || {}).reduce(
            (sum: number, qty: unknown) => sum + (Number(qty) || 0),
            0,
          );
          stockMap[variant.variantId] = totalStock;
        } catch {
          stockMap[variant.variantId] = 0;
        }
      });

      await Promise.all(promises);
      setAllVariantStock(stockMap);
    };

    loadAllVariantStock();
  }, [product?.id, isOpen]);

  // Load stock for selected variant (for size grid)
  useEffect(() => {
    if (
      !product ||
      !selectedVariant?.variantId ||
      !selectedVariant?.sizes?.length
    )
      return;

    const loadStock = async () => {
      setStockLoading(true);
      try {
        const res = await axiosInstance.get(
          `/web/inventory/batch?productId=${product.id}&variantId=${
            selectedVariant.variantId
          }&sizes=${selectedVariant.sizes.join(",")}`,
        );
        const data = res.data;
        setSizeStock(data.stock || {});
      } catch {
        setSizeStock({});
      } finally {
        setStockLoading(false);
      }
    };
    loadStock();
  }, [product?.id, selectedVariant?.variantId]);

  if (!isOpen || !product) return null;

  // Get promotion for display purposes only (banner)
  const activePromo = getPromotionForProduct(
    product.id,
    selectedVariant?.variantId,
  );

  // Calculate prices using shared pricing utilities
  const discountedPrice = calculateFinalPrice(product, activePromo);
  const originalPrice = getOriginalPrice(product);
  const hasAnyDiscount = checkHasDiscount(product, activePromo);
  const totalSavings = Math.max(0, originalPrice - discountedPrice);
  const isPromoDiscount = !!activePromo;


  // Helper to check if a variant is eligible for a promotion
  const getVariantPromotion = (variantId: string) => {
    const promo = getPromotionForProduct(product.id, variantId);
    if (!promo) return null;

    // Check variant eligibility using both applicableProductVariants and conditions
    const isEligible = isVariantEligibleForPromotion(
      product.id,
      variantId,
      promo.applicableProductVariants as ProductVariantTarget[] | undefined,
      promo.conditions as PromotionCondition[] | undefined,
    );

    return isEligible ? promo : null;
  };

  const availableStock = sizeStock[selectedSize] || 0;
  const bagQty =
    bagItems.find(
      (b) =>
        b.itemId === product.id &&
        b.variantId === selectedVariant?.variantId &&
        b.size === selectedSize,
    )?.quantity || 0;

  const isOutOfStock = Boolean(selectedSize && availableStock <= 0);
  const isLimitReached = Boolean(selectedSize && bagQty + qty > availableStock);

  const handleAddToBag = () => {
    if (!selectedSize || !selectedVariant) return;

    const productDiscount =
      Math.round(((product.discount / 100) * product.sellingPrice * qty) / 10) *
      10;
    dispatch(
      addToBag({
        itemId: product.id,
        variantId: selectedVariant.variantId,
        size: selectedSize,
        quantity: qty,
        price: product.sellingPrice,
        bPrice: 0,
        name: product.name,
        thumbnail: selectedVariant.images[0]?.url || product.thumbnail.url,
        discount: productDiscount,
        itemType: "product",
        maxQuantity: 10,
        variantName: selectedVariant.variantName,
        category: product.category || "",
        brand: product.brand || "",
      }),
    );
    toast.success(`Added ${qty} item${qty > 1 ? "s" : ""} to bag`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-100 flex items-end md:items-center justify-center p-0 md:p-6 lg:p-12">
          {/* Backdrop with high-performance blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-white/70"
            style={{ backdropFilter: "blur(8px)" }}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-surface w-full max-w-6xl h-[92vh] md:h-[85vh] shadow-hover rounded-t-3xl md:rounded-2xl border-t md:border border-default flex flex-col"
          >
            {/* ── HEADER BAR ─────────────────────────────── */}
            {/* Mobile: draggable handle strip that can swipe-to-close */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_e, info) => {
                if (info.offset.y > 80) onClose();
              }}
              className="md:hidden flex items-center justify-between px-4 pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
            >
              {/* Centered pill handle */}
              <div className="flex-1 flex justify-center">
                <div className="w-12 h-1.5 bg-primary-200 rounded-full" />
              </div>
              {/* X button right side on mobile */}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:opacity-70 transition-all"
                style={{
                  color: "var(--color-accent)",
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </motion.div>

            {/* Desktop: simple header row with close button */}
            <div className="hidden md:flex items-center justify-end px-4 pt-4 shrink-0">
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:opacity-70 transition-all"
                style={{
                  color: "var(--color-accent)",
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden hide-scrollbar">
              {/* LEFT: VISUALS SECTION */}
              <div className="w-full md:w-1/2 flex flex-col bg-surface-2 md:border-r border-default md:shrink-0 md:overflow-y-auto hide-scrollbar">
                <div className="relative aspect-4/3 md:aspect-auto md:min-h-[400px] md:flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-12">
                  <Image
                    src={
                      selectedVariant?.images?.[0]?.url || product.thumbnail.url
                    }
                    alt={product.name}
                    width={600}
                    height={600}
                    className="w-full h-full max-h-[50vh] md:max-h-full object-contain mix-blend-multiply relative z-10 transition-transform duration-700"
                    priority
                  />
                </div>

                {/* Variant Swatches */}
                {product.variants.length > 1 && (
                  <div className="px-4 sm:px-6 py-4 md:py-6 flex gap-2 sm:gap-3 overflow-x-auto hide-scrollbar justify-start md:justify-center bg-surface-2 border-t border-default md:border-t-0">
                    {product.variants.map((v) => {
                      // Check if this specific variant is eligible for a promotion
                      const variantPromo = getVariantPromotion(v.variantId);
                      // Check if variant is out of stock
                      const variantTotalStock = allVariantStock[v.variantId];
                      const isVariantOutOfStock =
                        variantTotalStock !== undefined &&
                        variantTotalStock <= 0;

                      return (
                        <Button
                          type="text"
                          key={v.variantId}
                          onClick={() => {
                            setSelectedVariant(v);
                            setSelectedSize("");
                          }}
                          disabled={isVariantOutOfStock}
                          className={`relative w-12 h-12 sm:w-14 sm:h-14 shrink-0 bg-surface transition-all rounded-xl p-1 ${
                            selectedVariant?.variantId === v.variantId
                              ? "border-accent border-2 shadow-custom scale-105 z-10 hover:bg-surface focus:bg-surface"
                              : "border border-default hover:border-accent opacity-60 hover:opacity-100 hover:bg-surface focus:bg-surface"
                          } ${
                            isVariantOutOfStock
                              ? "opacity-40 cursor-not-allowed"
                              : ""
                          }`}
                          title={
                            isVariantOutOfStock
                              ? `${v.variantName} - Out of Stock`
                              : variantPromo
                                ? `${v.variantName} - ${
                                    variantPromo.name || "Promo"
                                  }`
                                : v.variantName
                          }
                        >
                          <div
                            className={`relative w-full h-full ${
                              isVariantOutOfStock ? "grayscale" : ""
                            }`}
                          >
                            <Image
                              src={v.images[0]?.url || ""}
                              alt={v.variantName}
                              fill
                              className="object-contain mix-blend-multiply"
                            />
                          </div>
                          {/* Out of Stock indicator - diagonal line */}
                          {isVariantOutOfStock && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-full h-0.5 bg-error/70 rotate-45 transform origin-center" />
                            </div>
                          )}
                          {/* Promotion indicator badge */}
                          {variantPromo && !isVariantOutOfStock && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-warning rounded-full border-2 border-surface flex items-center justify-center shadow-custom">
                              <span className="text-[7px] font-black text-dark">
                                %
                              </span>
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT: DETAILS SECTION */}
              <div className="w-full md:w-1/2 p-4 sm:p-6 md:p-10 lg:p-12 flex flex-col bg-surface md:overflow-y-auto hide-scrollbar">
                {/* Promotion Banner - Display Only */}
                <AnimatePresence>
                  {activePromo && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-warning text-dark p-3 sm:p-4 mb-4 sm:mb-6 -mx-4 sm:-mx-6 md:-mx-10 lg:-mx-12 px-4 sm:px-6 md:px-10 lg:px-12 flex items-center gap-2 sm:gap-3 shadow-custom"
                    >
                      <IoFlash className="animate-pulse shrink-0" size={16} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-display font-black uppercase tracking-tighter truncate">
                          {activePromo.name || "Special Offer"}
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-80 hidden sm:block">
                          Limited Time Offer
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mb-4 sm:mb-6">
                  <p className="text-accent text-[10px] sm:text-xs font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-1 sm:mb-2">
                    {product.brand?.replace("-", " ")}
                  </p>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-black text-primary-dark leading-tight uppercase tracking-tighter">
                    {product.name}
                  </h2>
                </div>

                {/* Performance Pricing Area */}
                <div className="flex items-center gap-3 flex-wrap mb-6 sm:mb-8">
                  <span
                    className={`text-2xl sm:text-3xl font-display font-black tracking-tighter ${
                      isPromoDiscount ? "text-warning" : "text-primary-dark"
                    }`}
                  >
                    Rs. {discountedPrice.toLocaleString()}
                  </span>

                  {/* Show original selling price struck */}
                  {hasAnyDiscount && originalPrice > discountedPrice && (
                    <span className="text-muted text-sm sm:text-lg line-through decoration-default">
                      Rs. {originalPrice.toLocaleString()}
                    </span>
                  )}

                  {/* Savings Pill */}
                  {hasAnyDiscount && totalSavings > 0 && (
                    <span className="bg-success text-white text-[9px] sm:text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-custom">
                      {isPromoDiscount ? "Promo Save" : "Save"} Rs. {totalSavings.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Size Grid - Integrated with Brand Styling */}
                <div className="mb-6 sm:mb-8">
                  <div className="flex justify-between items-center mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-primary-dark">
                      Select Size
                    </p>
                    <Button
                      type="link"
                      onClick={() => {}} // Add Size Guide click handler if exists in parent context later
                      className="text-[9px] sm:text-[10px] font-bold uppercase text-accent hover:text-primary-dark transition-colors underline underline-offset-4 p-0 h-auto"
                    >
                      Size Guide
                    </Button>
                  </div>
                  <SizeGrid
                    sizes={selectedVariant?.sizes || []}
                    selectedSize={selectedSize}
                    onSelectSize={setSelectedSize}
                    stockMap={sizeStock}
                    stockLoading={stockLoading}
                  />
                </div>

                {/* Quantity Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-primary-dark">
                      Quantity
                    </span>
                    <div className="flex items-center bg-surface-2 border border-default rounded-full px-3 py-1.5 sm:px-4 sm:py-2">
                      <Button
                        type="text"
                        onClick={() => setQty((p) => Math.max(1, p - 1))}
                        className="p-1 hover:text-accent disabled:opacity-10 transition-colors h-auto w-auto bg-transparent border-none"
                        disabled={qty <= 1}
                        icon={<IoRemove size={18} />}
                      />
                      <span className="w-10 sm:w-12 text-center text-sm sm:text-base font-display font-black tracking-tighter">
                        {qty}
                      </span>
                      <Button
                        type="text"
                        onClick={() =>
                          setQty((p) =>
                            Math.min(availableStock - bagQty || 10, p + 1),
                          )
                        }
                        className="p-1 hover:text-accent disabled:opacity-10 transition-colors h-auto w-auto bg-transparent border-none"
                        disabled={qty >= availableStock - bagQty || qty >= 10}
                        icon={<IoAdd size={18} />}
                      />
                    </div>
                  </div>

                  {selectedSize && !stockLoading && (
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          availableStock < 5
                            ? "bg-error animate-ping"
                            : "bg-success"
                        }`}
                      />
                      <span
                        className={`text-[10px] sm:text-xs font-black uppercase tracking-tighter ${
                          availableStock < 5 ? "text-error" : "text-success"
                        }`}
                      >
                        {availableStock < 5
                          ? `Urgent: Only ${availableStock} Left`
                          : "In Stock"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Performance Pills */}
                <div className="mt-auto space-y-3 pb-8 sm:pb-6 md:pb-0">
                  <Button
                    type="primary"
                    onClick={handleAddToBag}
                    disabled={
                      !product.inStock ||
                      !selectedSize ||
                      isOutOfStock ||
                      isLimitReached
                    }
                    className={`group w-full h-auto py-5 sm:py-6 border-none rounded-full font-display font-black uppercase tracking-wider text-xs sm:text-sm transition-all hover:shadow-hover active:scale-[0.98] disabled:cursor-not-allowed ${
                      !product.inStock || isOutOfStock || isLimitReached
                        ? "bg-error! text-inverse! disabled:bg-error! disabled:text-inverse/80!"
                        : !selectedSize
                          ? "bg-surface-3 text-muted disabled:bg-surface-3! disabled:text-muted!"
                          : activePromo
                            ? "bg-warning! text-dark! hover:bg-warning/80!"
                            : "bg-dark text-inverse hover:bg-accent hover:text-dark!"
                    }`}
                  >
                    {!product.inStock || isOutOfStock
                      ? "Sold Out"
                      : isLimitReached
                        ? "Inventory Maxed"
                        : "Add to Bag"}
                  </Button>

                  <Link
                    href={`/collections/products/${product.id}`}
                    onClick={onClose}
                    className="flex items-center justify-center w-full py-3 sm:py-4 border-2 border-default rounded-full font-black text-[10px] sm:text-xs uppercase tracking-widest text-primary-dark hover:bg-surface-2 hover:border-dark transition-all"
                  >
                    View Full Details
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default QuickViewModal;
