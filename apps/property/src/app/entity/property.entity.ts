import {Entity,Column,PrimaryGeneratedColumn} from 'typeorm';

export interface GeoSpatialField {
  lat: number;
  lng: number;
}

export interface AllowedViewer {
  customerPhone: string;
  customerName: string;
  transactionCode: string;
  amount: number;
  transactionId: string;
  date: string;
  customerEmail?: string;
  reason?: string;
  status?: string;
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

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column()
  propertyType!: string;

  @Column({ type: 'json', nullable: true })
  imageUrl!: string[];

  @Column({ type: 'json', nullable: true })
  videoUrl!: string[];

  @Column({ type: 'json', nullable: true })
  postgis_spatial_field!: GeoSpatialField | null;

  @Column()
  isAvailable!: boolean;

  @Column()
  createdAt!: Date;

  @Column({ nullable: true })
  updatedAt!: Date;

  @Column()
  location!: string;

  @Column()
  brokersUniqueCode!: string;

  @Column({ type: 'json', nullable: true })
  allowedViewers!: AllowedViewer[];

  @Column()
  photoCount!: number;

  @Column()
  videoCount!: number;

  @Column({ nullable: true })
  bookingStatus!: string;
}
