import React, { useEffect, useState } from 'react';
import { Smartphone, Laptop, Headphones } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import heroShowcaseImg from '@/src/assets/images/hero_electronics_showcase_1795168475559.jpg';
import iphoneFlagshipImg from '@/src/assets/images/product_iphone_flagship_1795168475656.jpg';
import androidFlagshipImg from '@/src/assets/images/product_android_flagship_1795168475255.jpg';
import laptopUltrabookImg from '@/src/assets/images/product_laptop_ultrabook_1795168475793.jpg';
import audioAccessoriesImg from '@/src/assets/images/product_audio_accessories_1795168475567.jpg';

const BUNDLED_IMAGE_MAP: Record<string, string> = {
  'hero_electronics_showcase_1795168475559.jpg': heroShowcaseImg,
  'product_iphone_flagship_1795168475656.jpg': iphoneFlagshipImg,
  'product_android_flagship_1795168475255.jpg': androidFlagshipImg,
  'product_laptop_ultrabook_1795168475793.jpg': laptopUltrabookImg,
  'product_audio_accessories_1795168475567.jpg': audioAccessoriesImg,
};

const CATEGORY_FALLBACK_IMG: Record<string, string> = {
  iphones: iphoneFlagshipImg,
  android: androidFlagshipImg,
  laptops: laptopUltrabookImg,
  accessories: audioAccessoriesImg,
};

export function resolveProductImageSrc(src: string, categoryGroup = 'iphones'): string {
  const trimmed = (src || '').trim();
  const groupKey = (categoryGroup || 'iphones').toLowerCase();
  if (!trimmed) {
    return CATEGORY_FALLBACK_IMG[groupKey] || iphoneFlagshipImg;
  }
  const lower = trimmed.toLowerCase();
  for (const [filename, bundledUrl] of Object.entries(BUNDLED_IMAGE_MAP)) {
    if (lower.includes(filename.toLowerCase())) {
      return bundledUrl;
    }
  }
  return trimmed;
}

interface ProductImageProps {
  src: string;
  alt: string;
  categoryGroup?: string;
  className?: string;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  categoryGroup = 'iphones',
  className,
}) => {
  const groupKey = (categoryGroup || 'iphones').toLowerCase();
  const primarySrc = resolveProductImageSrc(src, groupKey);
  const fallbackSrc = CATEGORY_FALLBACK_IMG[groupKey] || iphoneFlagshipImg;

  const [currentSrc, setCurrentSrc] = useState(primarySrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(resolveProductImageSrc(src, categoryGroup));
    setFailed(false);
  }, [src, categoryGroup]);

  if (failed || !currentSrc) {
    const Icon =
      categoryGroup === 'laptops'
        ? Laptop
        : categoryGroup === 'accessories'
        ? Headphones
        : Smartphone;

    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 p-4 text-center',
          className
        )}
      >
        <Icon className="h-10 w-10 text-[#001B5E]/40 mb-2" />
        <span className="text-xs font-medium text-slate-600 line-clamp-2 max-w-[180px]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => {
        if (currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        } else {
          setFailed(true);
        }
      }}
      className={cn('object-cover', className)}
    />
  );
};
