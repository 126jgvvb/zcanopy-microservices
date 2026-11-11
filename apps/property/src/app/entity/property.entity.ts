import {Entity,Column,PrimaryGeneratedColumn} from 'typeorm';

export interface GeoSpatialField {
  lat: number;
  lng: number;
}

export interface AllowedViewer {
  customerId?: string;
  customerPhone: string;
  customerName: string;
  transactionCode: string;
  amount: number;
  transactionId: string;
  date: string;
  customerEmail?: string;
  reason?: string;
  status?: string;
  bookingCode?: string;

  /* ---- Booking fund escrow ---- */
  /** Countdown active (defaults to true for new bookings). */
  escrowEnabled?: boolean;
  /** Timeframe in days set by the customer. */
  escrowDays?: number;
  /**
   * Testing helper: when set, the countdown ends this many minutes from now
   * instead of `escrowDays` days. Lets the countdown be exercised in minutes
   * rather than days. 0 (or absent) means the day-based timeframe is used.
   */
  escrowMinutes?: number;
  /** ISO timestamp when the countdown hits zero. */
  escrowEndsAt?: string;
  /** Net amount held in the broker's held (escrow) balance for this booking. */
  escrowAmount?: number;
  /** Customer approved the booking — funds moved to the withdrawable wallet. */
  fundsReleased?: boolean;
  fundsReleasedAt?: string;
  /** Countdown expired — funds reversed back to the customer's phone number. */
  fundsReversed?: boolean;
  fundsReversedAt?: string;
  reversalReason?: string;
}

export interface BookingState {
  isBooked: boolean;
  bookingCount: number;
  latestBookingDate?: string;
}

@Entity()
export class PropertyEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({default:''})
  title!: string;

  @Column({default:''})
  description!: string;

  @Column({default:''})
  propertyType!: string;

  @Column({type:'json',nullable:true})
  imageUrl!: string[];

  @Column({type:'json',nullable:true})
  videoUrl!: string[];

  @Column({type:'json',nullable:true})
  postgis_spatial_field!: GeoSpatialField | null;

  @Column({default:false})
  isAvailable!: boolean;

  @Column({default:new Date()})
  createdAt!: Date;

  @Column({nullable:true})
  updatedAt!: Date;

  @Column({default:''})
  location!: string;

  @Column({type:'text',nullable:true})
  subCounty!: string | null;

  @Column({type:'text',nullable:true})
  district!: string | null;

  @Column({default:''})
  brokersUniqueCode!: string;

  @Column({type:'json',nullable:true})
  allowedViewers!: AllowedViewer[];

  @Column({default:0})
  photoCount!: number;

  @Column({default:0})
  videoCount!: number;

  @Column({nullable:true})
  bookingStatus!: string;

  @Column({default:0})
  price!: number;

  @Column({default:0})
  brokerBookingFee!: number;

  @Column({default:''})
  brokerBrandName!: string;
}
