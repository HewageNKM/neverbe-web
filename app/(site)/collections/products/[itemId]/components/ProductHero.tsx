"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  IoHeartOutline,
  IoHeart,
  IoAddOutline,
  IoRemoveOutline,
} from "react-icons/io5";
import { FaWhatsapp, FaTruckFast, FaArrowRotateLeft } from "react-icons/fa6";
import { motion, AnimatePresence } from "framer-motion";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "antd";

import { AppDispatch, RootState } from "@/redux/store";
import { addToBag } from "@/redux/bagSlice/bagSlice";
import {
  toggleWishlist,
  hydrateWishlist,
  WishlistItem,
} from "@/redux/wishlistSlice/wishlistSlice";
import { Product } from "@/interfaces/Product";
import { ProductVariant } from "@/interfaces/ProductVariant";
import { KOKOLogo } from "@/assets/images";
import SizeGuideDialog from "@/components/SizeGuideDialog";
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
  hasConditions,
} from "@/utils/pricing";
import StockBadge from "@/components/StockBadge";
import ShareButtons from "@/components/ShareButtons";
import SizeGrid from "@/components/SizeGrid";
import axiosInstance from "@/actions/axiosInstance";

const ProductHero = ({ item }: { item: Product }) => {
  const router = useRouter();
  const dispatch: AppDispatch = useDispatch();
  const bagItems = useSelector((state: RootState) => state.bag.bag);
  const wishlistItems = useSelector((state: RootState) => state.wishlist.items);
  const { getPromotionForProduct } = usePromotionsContext();

  // Hydrate wishlist from localStorage on mount
  useEffect(() => {
    dispatch(hydrateWishlist());
  }, [dispatch]);

  const [selectedImage, setSelectedImage] = useState(item.thumbnail);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant>(
    item.variants[0],
  );
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  // Track stock for ALL variants (variantId -> total stock)
  const [allVariantStock, setAllVariantStock] = useState<
    Record<string, number>
  >({});

  // Get promotion for display purposes only (banner)
  const activePromo = getPromotionForProduct(
    item.id,
    selectedVariant.variantId,
  );

  // Calculate prices using shared pricing utilities
  const discountedPrice = calculateFinalPrice(item, activePromo);
  const originalPrice = getOriginalPrice(item);
  const hasAnyDiscount = checkHasDiscount(item, activePromo);
  const totalSavings = Math.max(0, originalPrice - discountedPrice);
  const isPromoDiscount = !!activePromo && !hasConditions(activePromo);


  // Helper to check if a variant has a promotion indicator
  const getVariantPromotion = (variantId: string) => {
    const promo = getPromotionForProduct(item.id, variantId);
    if (!promo) return null;

    // Check variant eligibility using both applicableProductVariants and conditions
    const isEligible = isVariantEligibleForPromotion(
      item.id,
      variantId,
      promo.applicableProductVariants as ProductVariantTarget[] | undefined,
      promo.conditions as PromotionCondition[] | undefined,
    );

    return isEligible ? promo : null;
  };

  useEffect(() => {
    if (selectedVariant.images?.length) {
      setSelectedImage(selectedVariant.images[0]);
    }
  }, [selectedVariant]);

  // Preload stock for ALL variants on component mount
  useEffect(() => {
    if (!item.variants?.length) return;

    const loadAllVariantStock = async () => {
      const stockMap: Record<string, number> = {};

      // Fetch stock for each variant in parallel
      const promises = item.variants.map(async (variant) => {
        if (!variant.sizes?.length) {
          stockMap[variant.variantId] = 0;
          return;
        }

        try {
          const res = await axiosInstance.get(
            `/web/inventory/batch?productId=${item.id}&variantId=${variant.variantId
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
  }, [item.id]);

  // Load stock for selected variant (for size grid)
  useEffect(() => {
    const fetchStock = async () => {
      setStockLoading(true);
      try {
        const res = await axiosInstance.get(
          `/web/inventory/batch?productId=${item.id}&variantId=${selectedVariant.variantId
          }&sizes=${selectedVariant.sizes.join(",")}`,
        );
        const data = res.data;
        setSizeStock(data.stock || {});
      } catch (e) {
        console.error(e);
      } finally {
        setStockLoading(false);
      }
    };
    fetchStock();
  }, [selectedVariant.variantId, item.id]);

  const availableStock = selectedSize ? (sizeStock[selectedSize] ?? 0) : 0;
  const bagQty =
    bagItems.find(
      (b) =>
        b.itemId === item.id &&
        b.variantId === selectedVariant.variantId &&
        b.size === selectedSize,
    )?.quantity || 0;
  const isLimitReached =
    selectedSize !== "" && availableStock > 0 && bagQty + qty > availableStock;

  // Check if current variant is in wishlist
  const isInWishlist = wishlistItems.some(
    (w) => w.productId === item.id && w.variantId === selectedVariant.variantId,
  );

  const handleToggleWishlist = () => {
    const wishlistItem: WishlistItem = {
      productId: item.id,
      variantId: selectedVariant.variantId,
      name: item.name,
      thumbnail: selectedVariant.images[0]?.url || item.thumbnail.url,
      price: item.sellingPrice,
      addedAt: new Date().toISOString(),
    };
    dispatch(toggleWishlist(wishlistItem));
  };

  const handleAddToBag = () => {
    if (!selectedSize) return;
    const productDiscount =
      Math.round(((item.discount / 100) * item.sellingPrice * qty) / 10) * 10;
    dispatch(
      addToBag({
        itemId: item.id,
        variantId: selectedVariant.variantId,
        size: selectedSize,
        quantity: qty,
        price: item.sellingPrice,
        name: item.name,
        thumbnail: selectedVariant.images[0]?.url || item.thumbnail.url,
        itemType: "product",
        variantName: selectedVariant.variantName,
        discount: productDiscount,
        maxQuantity: 10,
        category: item.category || "",
        brand: item.brand || "",
      } as any),
    );
    toast.success(`Added ${qty} item${qty > 1 ? "s" : ""} to bag`);
    setQty(1); // Reset quantity after adding
  };

  return (
    <section className="w-full max-w-[1800px] mx-auto px-4 md:px-10 lg:px-16 2xl:px-24 py-2 md:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 xl:gap-24 2xl:gap-32">
      {/* --- LEFT COLUMN: IMAGES --- */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="relative aspect-square bg-surface-2 rounded-2xl overflow-hidden group">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedImage.url}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              <Image
                src={selectedImage.url}
                alt={item.name}
                fill
                priority
                className="object-cover mix-blend-multiply"
              />
            </motion.div>
          </AnimatePresence>

          {/* Discount Badge - Branded */}
          {item.discount > 0 && (
            <div className="absolute top-4 left-4 bg-warning text-dark px-4 py-1.5 rounded-full font-display font-black text-[10px] uppercase tracking-tighter shadow-custom">
              {item.discount}% Off
            </div>
          )}
        </div>

        <div className="grid grid-cols-6 gap-2">
          {selectedVariant.images.map((img, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setSelectedImage(img)}
              className={`relative aspect-square bg-surface-2 rounded-xl overflow-hidden border-2 transition-all p-0 h-auto w-full ${selectedImage.url === img.url
                  ? "border-primary opacity-100 scale-95 shadow-md"
                  : "border-transparent opacity-70 hover:opacity-100 focus:opacity-100"
                }`}
            >
              <Image
                src={img.url}
                alt=""
                fill
                className="object-cover mix-blend-multiply"
              />
            </button>
          ))}
        </div>


      </div>

      {/* --- RIGHT COLUMN: DETAILS --- */}
      <div className="lg:col-span-5 relative lg:pl-4 xl:pl-8">
        <div className="lg:sticky lg:top-32 flex flex-col gap-12 xl:gap-16">
          {/* Promotion Banner - Display Only */}
          {activePromo && (
            <div className="bg-warning text-dark p-4 flex items-center gap-3 shadow-custom">
              <p className="text-sm font-display font-black uppercase tracking-tighter">
                {activePromo.name || "Special Offer"}
              </p>
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">
                Limited Time
              </span>
            </div>
          )}

          <header>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-accent mb-3">
              {item.brand?.replace("-", " ")}
            </h2>
            <h1 className="text-4xl lg:text-5xl font-display font-black uppercase tracking-tighter leading-[0.9] mb-6 text-primary-dark">
              {item.name}
            </h1>
            <div className="flex items-baseline gap-6 flex-wrap">
              <span
                className={`text-3xl font-display font-black tracking-tighter ${
                  isPromoDiscount ? "text-warning" : "text-primary-dark"
                }`}
              >
                Rs. {discountedPrice.toLocaleString()}
              </span>

              {/* Show original selling price struck */}
              {hasAnyDiscount && originalPrice > discountedPrice && (
                <span className="text-muted line-through text-base decoration-default">
                  Rs. {originalPrice.toLocaleString()}
                </span>
              )}

              {/* Savings Pill */}
              {hasAnyDiscount && totalSavings > 0 && (
                <span className="bg-success text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-custom">
                  {isPromoDiscount ? "Promo Save" : "Save"} Rs. {totalSavings.toLocaleString()}
                </span>
              )}

              {/* Stock Urgency Badge */}
              {selectedSize && (
                <StockBadge stockCount={availableStock} className="mt-2" />
              )}
            </div>

            {/* Value Props Ticker */}
            <div className="flex gap-6 mt-10 border-y border-default py-4">
              <div className="flex items-center gap-2">
                <FaTruckFast className="text-muted" size={16} />
                <span className="text-[10px] font-bold uppercase text-primary-dark">
                  Standard Shipping 2-3 Days
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FaArrowRotateLeft className="text-muted" size={16} />
                <span className="text-[10px] font-bold uppercase text-primary-dark">
                  Size Exchange
                </span>
              </div>
            </div>
          </header>

          {/* Color & Size Selection (Existing Logic) */}
          <div>
            <h3 className="text-xs font-bold uppercase mb-5 text-muted">
              Select Color
            </h3>
            <div className="flex flex-wrap gap-2">
              {item.variants.map((v) => {
                // Check if this specific variant is eligible for a promotion
                const variantPromo = getVariantPromotion(v.variantId);
                // Check if variant is out of stock
                const variantTotalStock = allVariantStock[v.variantId];
                const isVariantOutOfStock =
                  variantTotalStock !== undefined && variantTotalStock <= 0;

                return (
                  <button
                    type="button"
                    key={v.variantId}
                    onClick={() => {
                      setSelectedVariant(v);
                      setSelectedSize("");
                    }}
                    disabled={false} // Removed isVariantOutOfStock to allow selection
                    className={`relative w-20 h-20 bg-surface-2 rounded-xl overflow-hidden border-2 transition-all p-0 ${selectedVariant.variantId === v.variantId
                        ? "border-accent shadow-[0_0_0_2px_var(--color-green-500)]"
                        : "border-transparent opacity-60 hover:opacity-100 focus:opacity-100 hover:bg-surface-2 focus:bg-surface-2"
                      } ${isVariantOutOfStock ? "opacity-40" : ""}`}
                    title={
                      isVariantOutOfStock
                        ? `${v.variantName} - Out of Stock`
                        : variantPromo
                          ? `${v.variantName} - ${variantPromo.name || "Promo"}`
                          : v.variantName
                    }
                  >
                    <div
                      className={
                        isVariantOutOfStock
                          ? "grayscale w-full h-full"
                          : "w-full h-full"
                      }
                    >
                      <Image
                        src={v.images[0].url}
                        alt={v.variantName}
                        fill
                        className="object-cover mix-blend-multiply"
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
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xs font-bold uppercase text-muted">
                Select Size
              </h3>
              <Button
                type="link"
                onClick={() => setShowSizeGuide(true)}
                className="text-xs text-primary-dark underline p-0 h-auto"
              >
                Size Guide
              </Button>
            </div>
            <SizeGrid
              sizes={selectedVariant.sizes}
              selectedSize={selectedSize}
              onSelectSize={setSelectedSize}
              stockMap={sizeStock}
              stockLoading={stockLoading}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4 mt-4">
            {/* Quantity Selector */}
            <div className="flex flex-col gap-4">
              <span className="text-xs font-bold uppercase text-muted">
                Quantity
              </span>
              <div className="flex items-center gap-6">
                <div className="flex items-center border border-default rounded-full overflow-hidden">
                  <Button
                    type="text"
                    onClick={() => setQty(Math.max(1, qty - 1))}
                    disabled={qty <= 1}
                    className="w-12 h-12 flex items-center justify-center text-primary-dark hover:bg-surface-2 transition-colors disabled:text-muted disabled:cursor-not-allowed rounded-none p-0"
                    icon={<IoRemoveOutline size={20} />}
                  />
                  <span className="w-12 text-center font-display font-black text-base text-primary-dark">
                    {qty}
                  </span>
                  <Button
                    type="text"
                    onClick={() => setQty(Math.min(10, qty + 1))}
                    disabled={
                      qty >= 10 || (!!selectedSize && qty >= availableStock)
                    }
                    className="w-12 h-12 flex items-center justify-center text-primary-dark hover:bg-surface-2 transition-colors disabled:text-muted disabled:cursor-not-allowed rounded-none p-0"
                    icon={<IoAddOutline size={20} />}
                  />
                </div>
                {selectedSize && availableStock > 0 && (
                  <span className="text-[10px] text-muted font-bold uppercase bg-surface-2 px-3 py-1 rounded-full">
                    {availableStock} available
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="primary"
                onClick={handleAddToBag}
                disabled={
                  !item.inStock ||
                  !selectedSize ||
                  availableStock === 0 ||
                  isLimitReached
                }
                className={`flex-1 h-auto py-5 rounded-full font-display font-black uppercase tracking-widest text-xs transition-all shadow-custom hover:shadow-hover active:scale-95 disabled:shadow-none disabled:cursor-not-allowed border-none ${!item.inStock ||
                    (selectedSize && availableStock === 0) ||
                    isLimitReached
                    ? "bg-error! text-inverse! disabled:bg-error! disabled:text-inverse/80!"
                    : !selectedSize
                      ? "bg-surface-3 text-muted disabled:bg-surface-3! disabled:text-muted!"
                      : activePromo
                        ? "bg-warning! text-dark! hover:bg-warning/80!"
                        : "bg-primary text-inverse hover:bg-accent hover:text-primary-dark!"
                  }`}
              >
                {!item.inStock || (availableStock === 0 && selectedSize)
                  ? "Sold Out"
                  : isLimitReached
                    ? "Inventory Maxed"
                    : "Add to Bag"}
              </Button>

              {/* Wishlist Toggle */}
              <Button
                type="text"
                onClick={handleToggleWishlist}
                className={`w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all p-0 ${isInWishlist
                    ? "bg-primary border-primary text-inverse hover:bg-primary hover:text-inverse focus:bg-primary focus:text-inverse"
                    : "bg-surface border-default text-primary-dark hover:border-primary hover:bg-surface hover:text-primary-dark focus:bg-surface focus:text-primary-dark"
                  }`}
                aria-label={
                  isInWishlist ? "Remove from wishlist" : "Add to wishlist"
                }
                icon={
                  isInWishlist ? (
                    <IoHeart size={24} />
                  ) : (
                    <IoHeartOutline size={24} />
                  )
                }
              />
            </div>

            {/* Koko Installment Offer */}
            <div className="flex items-center justify-center gap-2 p-3 bg-surface-2 rounded-xl">
              <span className="text-[10px] font-bold text-primary-dark uppercase">
                Or 3 Interest-Free payments of Rs. {(discountedPrice / 3).toFixed(0)}{" "}
                with
              </span>
              <Image src={KOKOLogo} alt="Koko" width={35} height={12} />
            </div>
          </div>

          {/* Share & Help Section */}
          <div className="flex flex-col gap-4 border-t border-default pt-6">
            {/* Social Share Buttons */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted">
                Share
              </span>
              <ShareButtons
                title={item.name}
                url={`/collections/products/${item.id}`}
              />
            </div>

            {/* WhatsApp Specialist */}
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}`}
              className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-muted hover:text-primary-dark"
            >
              <FaWhatsapp size={16} /> Chat with a specialist
            </a>
          </div>
        </div>
      </div>

      {/* Product Description */}
      {item.description && (
        <div className="lg:col-span-12 border-t border-default pt-8 mt-4 md:mt-8 md:pt-10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-4">
            About This Product
          </h3>
          <div className="text-sm text-primary-dark leading-relaxed prose-product">
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
              components={{
                p: ({ children }) => (
                  <p className="mb-3 text-sm text-primary-dark leading-relaxed">
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold text-primary-dark">
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-primary-dark">{children}</em>
                ),
                ul: ({ children }) => (
                  <ul className="my-3 space-y-1.5 pl-0 list-none">
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="flex items-start gap-2 text-sm text-primary-dark">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span>{children}</span>
                  </li>
                ),
                ol: ({ children }) => (
                  <ol className="my-3 space-y-1.5 pl-4 list-decimal">
                    {children}
                  </ol>
                ),
                h1: ({ children }) => (
                  <h1 className="text-base font-display font-black uppercase tracking-tight text-primary-dark mt-4 mb-2">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-sm font-display font-black uppercase tracking-tight text-primary-dark mt-4 mb-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted mt-3 mb-1">
                    {children}
                  </h3>
                ),
                // Pass through u tag with styles intact, or apply custom styles
                u: ({ node, ...rest }) => {
                  const styleProps: React.CSSProperties = {};
                  const styleStr = (node?.properties?.style as string) || "";
                  if (styleStr.includes("color:red")) styleProps.color = "red";
                  if (styleStr.includes("font-weight:bold"))
                    styleProps.fontWeight = "bold";

                  return <u style={styleProps} {...rest} />;
                },
              }}
            >
              {item.description}
            </ReactMarkdown>
          </div>
        </div>
      )}

      <SizeGuideDialog
        isOpen={showSizeGuide}
        onClose={() => setShowSizeGuide(false)}
      />
    </section>
  );
};

export default ProductHero;
