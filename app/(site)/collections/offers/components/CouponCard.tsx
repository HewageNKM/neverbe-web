"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import CountdownTimer from "@/components/CountdownTimer";
import { Coupon } from "@/interfaces/Coupon";

interface Props {
  coupon: Coupon;
}

/**
 * CouponCard - NEVERBE Performance Style
 * Promotional coupon cards with branded styling and copy interaction.
 */
const CouponCard: React.FC<Props> = ({ coupon }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(coupon.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative flex bg-surface border border-default hover:border-accent transition-all group rounded-xl overflow-hidden"
    >
      {/* Visual Header / Discount */}
      <div className="bg-surface-2 p-4 sm:p-5 flex flex-col items-center justify-center min-w-[100px] sm:min-w-[120px]">
        <div className="text-2xl sm:text-3xl font-display font-black tracking-tighter text-primary-dark leading-none">
          {coupon.discountType === "PERCENTAGE"
            ? `${coupon.discountValue}%`
            : coupon.discountType === "FIXED"
            ? `Rs.${coupon.discountValue.toLocaleString()}`
            : "FREE"}
        </div>
        <div className="text-xs font-bold text-muted uppercase tracking-widest mt-1">
          {coupon.discountType === "FREE_SHIPPING" ? "Shipping" : "OFF"}
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="bg-accent text-white text-[10px] font-display font-black px-3 py-1 rounded-full uppercase tracking-tight">
              {coupon.code.toUpperCase()}
            </span>
            {coupon.endDate && (
              <div className="text-[10px] text-error font-bold flex items-center gap-1 uppercase tracking-wide">
                <span className="w-1 h-1 bg-error rounded-full animate-pulse" />
                <CountdownTimer
                  targetDate={
                    typeof coupon.endDate === "string"
                      ? coupon.endDate
                      : (coupon.endDate as any)?.toDate
                      ? (coupon.endDate as any).toDate().toISOString()
                      : new Date(coupon.endDate as any).toISOString()
                  }
                  labels={false}
                  compact={true}
                />
              </div>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-display font-black text-primary-dark uppercase tracking-tight line-clamp-2">
            {coupon.description || "Exclusive Member Offer"}
          </h3>

          {(!!coupon.minOrderAmount && coupon.minOrderAmount > 0) ||
          coupon.firstOrderOnly ? (
            <p className="text-[10px] text-muted font-bold uppercase tracking-wide mt-1">
              {!!coupon.minOrderAmount &&
                coupon.minOrderAmount > 0 &&
                `Min. Rs.${coupon.minOrderAmount.toLocaleString()}`}
              {coupon.firstOrderOnly && " • First Order"}
            </p>
          ) : null}
        </div>

        <button
          onClick={handleCopy}
          className={`mt-3 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
            copied
              ? "bg-success text-white"
              : "bg-dark text-inverse hover:bg-accent hover:text-white"
          }`}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </motion.div>
  );
};

export default CouponCard;
