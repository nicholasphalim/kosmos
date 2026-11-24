import { clsx } from "clsx";
import type { ComponentType } from "react";

type IkonProps = {
  className?: string;
  /** Diabaikan: ikon Kosmos adalah ilustrasi dengan ketebalan tetap. */
  strokeWidth?: number;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
};

export type IkonKosmos = ComponentType<IkonProps>;

/** Ikon ilustrasi Kosmos dari public/icons. Sumber SVG yang sama bisa dibuka di Figma. */
function ikon(nama: string): IkonKosmos {
  function Ikon({ className, "aria-label": label }: IkonProps) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- SVG statis kecil, tidak perlu optimasi gambar
      <img
        src={`/icons/${nama}.svg`}
        alt={label ?? ""}
        width={24}
        height={24}
        draggable={false}
        className={clsx("inline-block shrink-0 select-none", className)}
      />
    );
  }
  Ikon.displayName = `Ikon(${nama})`;
  return Ikon;
}

export const ArrowDown = ikon("arrow-down");
export const ArrowLeft = ikon("arrow-left");
export const Building = ikon("building");
export const CalendarCheck = ikon("calendar-check");
export const CreditCard = ikon("credit-card");
export const HardHat = ikon("hard-hat");
export const Receipt = ikon("receipt");
export const Wallet = ikon("wallet");
export const Building2 = ikon("building");
export const CalendarX = ikon("calendar-x");
export const Camera = ikon("camera");
export const ChartNoAxesColumnIncreasing = ikon("chart");
export const Check = ikon("check");
export const CheckCheck = ikon("check-check");
export const ChevronRight = ikon("chevron-right");
export const CirclePlus = ikon("circle-plus");
export const CircleQuestionMark = ikon("circle-question-mark");
export const Clock = ikon("clock");
export const Droplet = ikon("droplet");
export const FilePlus = ikon("file-plus");
export const House = ikon("house");
export const Image = ikon("image");
export const Info = ikon("info");
export const LoaderCircle = ikon("loader-circle");
export const LogOut = ikon("log-out");
export const MessageCircle = ikon("message-circle");
export const Play = ikon("play");
export const RefreshCw = ikon("refresh-cw");
export const RotateCcw = ikon("rotate-ccw");
export const Search = ikon("search");
export const Send = ikon("send");
export const ShieldCheck = ikon("shield-check");
export const Snowflake = ikon("snowflake");
export const Sparkles = ikon("sparkles");
export const Ticket = ikon("ticket");
export const TriangleExclamationPoint = ikon("triangle-alert");
export const User = ikon("user-round");
export const UserRound = ikon("user-round");
export const Wrench = ikon("wrench");
export const X = ikon("x");
export const Zap = ikon("zap");

export const SewaAktif = ikon("sewa-aktif");
export const SewaBerakhir = ikon("sewa-berakhir");
export const PrioritasTinggi = ikon("prioritas-tinggi");
export const PrioritasSedang = ikon("prioritas-sedang");
export const PrioritasRendah = ikon("prioritas-rendah");
export const PrioritasReview = ikon("prioritas-review");
export const PesanWhatsApp = ikon("pesan-whatsapp");
export const Terkirim = ikon("terkirim");
