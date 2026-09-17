import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CustomerOtpEntity } from './customer-otp.entity';
import { CustomerMessageEntity } from './customer-message.entity';
import { CustomerNotificationEntity } from './customer-notification.entity';

@Entity('customers')
export class CustomerEntity {
  @PrimaryGeneratedColumn()
  id!: string;

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

  @OneToMany(() => CustomerNotificationEntity, notification => notification.customer)
  notifications!: CustomerNotificationEntity[];
}
