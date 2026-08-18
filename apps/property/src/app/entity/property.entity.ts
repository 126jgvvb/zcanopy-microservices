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
}
