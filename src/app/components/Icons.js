'use client';

import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Chart01Icon,
  ChartAnalysisIcon,
  CreditCardAcceptIcon,
  CreditCardChangeIcon,
  User02Icon,
  UserAccountIcon,
  PlayCircle02Icon,
  File01Icon,
  File02Icon,
  Shield01Icon,
  ShieldAlertIcon,
  AlertCircleIcon,
  Alert02Icon,
  CheckmarkCircle01Icon,
  CheckmarkBadge01Icon,
  ArrowBigUpDashIcon,
  ArrowBigDownDashIcon,
  Refresh01Icon,
  Clock01Icon,
  Mail01Icon,
  Message01Icon,
  Search01Icon,
  FilterHorizontalIcon,
  Copy01Icon,
  Coins01Icon,
  Wallet01Icon,
  Invoice01Icon,
  ReceiptIndianRupeeIcon,
  Discount01Icon,
  Cancel01Icon,
  ChevronRightIcon,
  ChevronDownIcon,
  Settings02Icon,
  ZapIcon,
  FlashIcon
} from '@hugeicons/core-free-icons';

// Factory wrapper for consistent Hugeicons rendering
const createIcon = (iconData, defaultSize = 18) => {
  const Component = ({ size = defaultSize, className = '', color, ...props }) => {
    return (
      <HugeiconsIcon
        icon={iconData}
        size={size}
        className={className}
        color={color}
        {...props}
      />
    );
  };
  Component.displayName = 'HugeIcon';
  return Component;
};

// Navigation & Brand Icons
export const IconDashboard = createIcon(Chart01Icon, 18);
export const IconAnalytics = createIcon(ChartAnalysisIcon, 18);
export const IconCases = createIcon(CreditCardChangeIcon, 18);
export const IconCustomers = createIcon(User02Icon, 18);
export const IconSimulator = createIcon(PlayCircle02Icon, 18);
export const IconAudit = createIcon(File01Icon, 18);
export const IconSettings = createIcon(Settings02Icon, 18);
export const IconShield = createIcon(Shield01Icon, 18);
export const IconSecurityAlert = createIcon(ShieldAlertIcon, 18);

// Status & Indicators
export const IconSuccess = createIcon(CheckmarkCircle01Icon, 16);
export const IconBadgeCheck = createIcon(CheckmarkBadge01Icon, 16);
export const IconWarning = createIcon(AlertCircleIcon, 16);
export const IconDanger = createIcon(Alert02Icon, 16);
export const IconClock = createIcon(Clock01Icon, 16);
export const IconRefresh = createIcon(Refresh01Icon, 16);
export const IconTrendUp = createIcon(ArrowBigUpDashIcon, 16);
export const IconTrendDown = createIcon(ArrowBigDownDashIcon, 16);

// Actions & Utilities
export const IconSearch = createIcon(Search01Icon, 16);
export const IconFilter = createIcon(FilterHorizontalIcon, 16);
export const IconCopy = createIcon(Copy01Icon, 14);
export const IconClose = createIcon(Cancel01Icon, 16);
export const IconChevronRight = createIcon(ChevronRightIcon, 14);
export const IconChevronDown = createIcon(ChevronDownIcon, 14);
export const IconZap = createIcon(ZapIcon, 16);
export const IconFlash = createIcon(FlashIcon, 16);

// Domain & Financials
export const IconCard = createIcon(CreditCardAcceptIcon, 18);
export const IconInvoice = createIcon(Invoice01Icon, 18);
export const IconRupee = createIcon(ReceiptIndianRupeeIcon, 18);
export const IconCoins = createIcon(Coins01Icon, 18);
export const IconWallet = createIcon(Wallet01Icon, 18);
export const IconDiscount = createIcon(Discount01Icon, 18);
export const IconEmail = createIcon(Mail01Icon, 16);
export const IconMessage = createIcon(Message01Icon, 16);
export const IconUser = createIcon(UserAccountIcon, 18);
export const IconFile = createIcon(File02Icon, 16);
