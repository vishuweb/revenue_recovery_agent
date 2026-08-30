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
  UserGroupIcon,
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
  ChevronLeftIcon,
  Settings02Icon,
  ZapIcon,
  FlashIcon,
  Notification03Icon,
  Moon02Icon,
  Sun01Icon,
  TrendingUpIcon,
  ArrowUpRight01Icon,
  LayersIcon,
  PieChart01Icon,
  DatabaseIcon,
  WorkflowIcon,
  StarsIcon,
  EyeIcon,
  FileExportIcon,
  Calendar03Icon,
  SparklesIcon,
  CommandIcon,
  MoreVerticalIcon,
  MoreHorizontalIcon,
  ExternalLinkIcon,
  InformationCircleIcon,
  CheckListIcon,
  BankIcon,
  DollarCircleIcon,
  BarChartIcon,
  Activity01Icon,
  LockKeyholeIcon,
  LockOpenIcon,
  Tag01Icon,
  LinkIcon
} from '@hugeicons/core-free-icons';

const createIcon = (iconData, defaultSize = 18) => {
  const Component = ({ size = defaultSize, className = '', color, strokeWidth, ...props }) => {
    return (
      <HugeiconsIcon
        icon={iconData}
        size={size}
        className={className}
        color={color}
        strokeWidth={strokeWidth}
        {...props}
      />
    );
  };
  Component.displayName = 'HugeIcon';
  return Component;
};

// Navigation and Brand
export const IconDashboard    = createIcon(Chart01Icon, 18);
export const IconAnalytics    = createIcon(ChartAnalysisIcon, 18);
export const IconCases        = createIcon(CreditCardChangeIcon, 18);
export const IconCustomers    = createIcon(User02Icon, 18);
export const IconSimulator    = createIcon(PlayCircle02Icon, 18);
export const IconAudit        = createIcon(File01Icon, 18);
export const IconSettings     = createIcon(Settings02Icon, 18);
export const IconShield       = createIcon(Shield01Icon, 18);
export const IconSecurityAlert = createIcon(ShieldAlertIcon, 18);

// Status and Indicators
export const IconSuccess    = createIcon(CheckmarkCircle01Icon, 16);
export const IconBadgeCheck = createIcon(CheckmarkBadge01Icon, 16);
export const IconWarning    = createIcon(AlertCircleIcon, 16);
export const IconDanger     = createIcon(Alert02Icon, 16);
export const IconInfo       = createIcon(InformationCircleIcon, 16);
export const IconClock      = createIcon(Clock01Icon, 16);
export const IconRefresh    = createIcon(Refresh01Icon, 16);
export const IconTrendUp    = createIcon(ArrowBigUpDashIcon, 16);
export const IconTrendDown  = createIcon(ArrowBigDownDashIcon, 16);
export const IconActivity   = createIcon(Activity01Icon, 16);

// Actions and Utilities
export const IconSearch       = createIcon(Search01Icon, 16);
export const IconFilter       = createIcon(FilterHorizontalIcon, 16);
export const IconCopy         = createIcon(Copy01Icon, 14);
export const IconClose        = createIcon(Cancel01Icon, 16);
export const IconChevronRight = createIcon(ChevronRightIcon, 14);
export const IconChevronDown  = createIcon(ChevronDownIcon, 14);
export const IconChevronLeft  = createIcon(ChevronLeftIcon, 14);
export const IconZap          = createIcon(ZapIcon, 16);
export const IconFlash        = createIcon(FlashIcon, 16);
export const IconSparkles     = createIcon(SparklesIcon, 16);
export const IconMoreVert     = createIcon(MoreVerticalIcon, 16);
export const IconMoreHoriz    = createIcon(MoreHorizontalIcon, 16);
export const IconExternalLink = createIcon(ExternalLinkIcon, 14);
export const IconArrowUpRight = createIcon(ArrowUpRight01Icon, 14);
export const IconLink         = createIcon(LinkIcon, 14);
export const IconCommand      = createIcon(CommandIcon, 14);
export const IconExport       = createIcon(FileExportIcon, 16);
export const IconEye          = createIcon(EyeIcon, 16);
export const IconLock         = createIcon(LockKeyholeIcon, 16);
export const IconUnlock       = createIcon(LockOpenIcon, 16);
export const IconTag          = createIcon(Tag01Icon, 14);
export const IconCheckList    = createIcon(CheckListIcon, 16);

// Domain and Financials
export const IconCard      = createIcon(CreditCardAcceptIcon, 18);
export const IconInvoice   = createIcon(Invoice01Icon, 18);
export const IconRupee     = createIcon(ReceiptIndianRupeeIcon, 18);
export const IconCoins     = createIcon(Coins01Icon, 18);
export const IconWallet    = createIcon(Wallet01Icon, 18);
export const IconDiscount  = createIcon(Discount01Icon, 18);
export const IconEmail     = createIcon(Mail01Icon, 16);
export const IconMessage   = createIcon(Message01Icon, 16);
export const IconUser      = createIcon(UserAccountIcon, 18);
export const IconUserGroup = createIcon(UserGroupIcon, 18);
export const IconFile      = createIcon(File02Icon, 16);
export const IconBank      = createIcon(BankIcon, 18);
export const IconDollar    = createIcon(DollarCircleIcon, 18);
export const IconBarChart  = createIcon(BarChartIcon, 18);
export const IconPieChart  = createIcon(PieChart01Icon, 18);
export const IconDatabase  = createIcon(DatabaseIcon, 18);
export const IconWorkflow  = createIcon(WorkflowIcon, 18);
export const IconLayers    = createIcon(LayersIcon, 18);
export const IconStars     = createIcon(StarsIcon, 16);
export const IconCalendar  = createIcon(Calendar03Icon, 16);

// Ambient and UI
export const IconBell       = createIcon(Notification03Icon, 18);
export const IconMoon       = createIcon(Moon02Icon, 16);
export const IconSun        = createIcon(Sun01Icon, 16);
export const IconTrendingUp = createIcon(TrendingUpIcon, 16);
