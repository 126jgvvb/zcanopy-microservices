import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type LandlordVerificationStatus = 'pending' | 'approved' | 'rejected';
export type LandlordTenureType = 'mailo' | 'freehold' | 'leasehold' | 'customary';

/**
 * A broker-submitted landlord identity + property title record used to
 * prepare a UgNLIS title search payload. Admins verify it and record the
 * instrument number returned by the Ministry Zonal Office before the
 * broker is allowed to withdraw funds.
 */
@Entity()
@Index(['landlordNin'])
@Index(['landlordPhoneNumber'])
@Index(['landlordFullName'])
@Index(['brokerCode'])
export class LandlordVerificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Broker that submitted the landlord details (broker_entity.id). */
  @Column({ default: '' })
  brokerId!: string;

  @Column({ default: '' })
  brokerCode!: string;

  /* ---- Section 1: landlord identity ---- */
  @Column({ default: '' })
  landlordFullName!: string;

  @Column({ default: '' })
  landlordNin!: string;

  @Column({ default: '' })
  landlordPhoneNumber!: string;

  @Column({ nullable: true })
  landlordEmail?: string;

  /* ---- Section 2: ministry & tenure ---- */
  @Column({ default: '' })
  mzoDistrict!: string;

  @Column({ default: 'mailo' })
  tenureType!: string;

  /* ---- Section 3: dynamic property location fields ---- */
  @Column({ nullable: true })
  countyDivision?: string;

  @Column({ nullable: true })
  blockNumber?: string;

  @Column({ nullable: true })
  plotNumber?: string;

  @Column({ nullable: true })
  volumeNumber?: string;

  @Column({ nullable: true })
  folioNumber?: string;

  @Column({ nullable: true })
  leaseExpiryDate?: string;

  @Column({ nullable: true })
  subCountyVillage?: string;

  @Column({ nullable: true })
  ccoRefNumber?: string;

  /* ---- Admin review ---- */
  /** Ministry instrument number recorded by the admin on approval. */
  @Column({ nullable: true })
  instrumentNumber?: string;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ default: 'pending' })
  status!: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ nullable: true })
  reviewedByAdminId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
