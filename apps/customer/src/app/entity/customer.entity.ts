import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, BeforeInsert } from 'typeorm';
import { CustomerOtpEntity } from './customer-otp.entity';
import { CustomerMessageEntity } from './customer-message.entity';
import { CustomerNotificationEntity } from './customer-notification.entity';

@Entity('customers')
export class CustomerEntity {
  @PrimaryColumn({ type: 'varchar', length: 6 })
  id!: string | null;

  @Column({ unique: true })
  email!: string;

  @Column({ nullable: true })
  passwordHash!: string;

  @Column({ nullable: true })
  phoneNumber!: string;

  @Column({ nullable: true })
  googleId!: string;

  @Column({ default: 'email' })
  authProvider!: string;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ default: false })
  isActive!: boolean;

  @Column({ nullable: true })
  lastName!: string;

  @Column({ nullable: true })
  firstName!: string;

  @Column({ nullable: true })
  fcmToken!: string;

  @Column({ nullable: true })
  lastLoginAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => CustomerOtpEntity, otp => otp.customer)
  otps!: CustomerOtpEntity[];

  @OneToMany(() => CustomerMessageEntity, msg => msg.customer)
  messages!: CustomerMessageEntity[];

  @OneToMany(() => CustomerNotificationEntity, notif => notif.customer)
  notifications!: CustomerNotificationEntity[];

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      // Generate a 6-digit numeric ID
      this.id = Math.floor(100000 + Math.random() * 900000).toString();
    }
  }
}
