import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../environments/environment';

export interface Profile {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  gender: 'Male' | 'Female' | 'Other';
  date_of_birth: string;
  height_cm: number | null;
  religion: string;
  caste_community: string | null;
  gothram: string | null;
  rasi: string | null;
  star_nakshatram: string | null;
  mother_tongue: string;
  native_district: string;
  current_city: string;
  education: string | null;
  profession: string | null;
  annual_income: number | null;
  family_details: string | null;
  profile_photo_url: string | null;
  has_photo?: boolean;
  bio: string | null;
}

export type ProfileInput = Omit<Profile, 'id' | 'user_id'>;
export type InterestStatus = 'Requested' | 'Accepted' | 'Declined';

export interface Interest {
  id: number;
  sender_id: number;
  receiver_id: number;
  status: InterestStatus;
  first_name: string;
  last_name: string;
  native_district: string;
  profession: string | null;
  direction: 'incoming' | 'outgoing';
}

export interface AuthResponse {
  token: string;
  user: { id: number; email: string; accountStatus: 'Pending' | 'Active' | 'Suspended'; role: 'user' | 'admin' };
}

export interface AdminUser {
  id: number;
  email: string;
  phone: string;
  account_status: 'Pending' | 'Active' | 'Suspended';
  role: 'user' | 'admin';
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  date_of_birth: string | null;
  age: number | null;
  height_cm: number | null;
  religion: string | null;
  caste_community: string | null;
  gothram: string | null;
  rasi: string | null;
  star_nakshatram: string | null;
  mother_tongue: string | null;
  native_district: string | null;
  current_city: string | null;
  education: string | null;
  profession: string | null;
  annual_income: number | string | null;
  family_details: string | null;
  bio: string | null;
  has_photo: boolean;
}

export interface ProfileSearchResult {
  profiles: Profile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubscriptionPlan {
  id: number;
  duration_months: number;
  name: string;
  amount: number | string | null;
  currency: string;
  is_active?: boolean;
}

export interface SubscriptionRecord {
  id: number;
  status: 'Pending' | 'Active' | 'Rejected' | 'Expired';
  starts_at: string | null;
  ends_at: string | null;
  duration_months: number;
  plan_name: string;
  payment_status: 'Pending' | 'Approved' | 'Rejected';
  amount: number | string;
  currency: string;
  transaction_reference: string;
  payment_created_at: string;
  review_note: string | null;
}

export interface SubscriptionPayment {
  id: number;
  user_id: number;
  email: string;
  phone: string;
  plan_name: string;
  duration_months: number;
  amount: number | string;
  currency: string;
  transaction_reference: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  register(value: { email: string; password: string; phone: string }) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/register`, value);
  }

  login(value: { email: string; password: string }) {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/login`, value);
  }

  adminUsers() {
    return this.http.get<AdminUser[]>(`${this.baseUrl}/admin/users`);
  }

  subscriptionPlans() {
    return this.http.get<SubscriptionPlan[]>(`${this.baseUrl}/subscription/plans`);
  }

  mySubscription() {
    return this.http.get<SubscriptionRecord | null>(`${this.baseUrl}/subscription/me`);
  }

  requestSubscription(planId: number, transactionReference: string) {
    return this.http.post<{ paymentId: number; status: string }>(`${this.baseUrl}/subscription/payments`, { planId, transactionReference });
  }

  adminSubscriptionPlans() {
    return this.http.get<SubscriptionPlan[]>(`${this.baseUrl}/admin/subscription-plans`);
  }

  adminSubscriptionPayments() {
    return this.http.get<SubscriptionPayment[]>(`${this.baseUrl}/admin/subscription-payments`);
  }

  updateSubscriptionPlan(id: number, amount: number, currency: string) {
    return this.http.patch<{ id: number; amount: number; currency: string }>(`${this.baseUrl}/admin/subscription-plans/${id}`, { amount, currency });
  }

  reviewSubscriptionPayment(id: number, status: 'Approved' | 'Rejected', reviewNote: string) {
    return this.http.patch<{ id: number; status: string }>(`${this.baseUrl}/admin/subscription-payments/${id}`, { status, reviewNote });
  }

  search(filters: Record<string, string | number>) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ProfileSearchResult>(`${this.baseUrl}/profiles/search`, { params });
  }

  setAccountStatus(userId: number, accountStatus: 'Active' | 'Suspended') {
    return this.http.patch<{ id: number; accountStatus: 'Active' | 'Suspended' }>(
      `${this.baseUrl}/admin/users/${userId}/status`,
      { accountStatus },
    );
  }

  myProfile() {
    return this.http.get<Profile | null>(`${this.baseUrl}/profiles/me`);
  }

  saveProfile(value: ProfileInput) {
    return this.http.put<Profile>(`${this.baseUrl}/profiles/me`, value);
  }

  uploadProfilePhoto(file: File) {
    const data = new FormData();
    data.append('photo', file);
    return this.http.post<{ has_photo: boolean }>(`${this.baseUrl}/profiles/me/photo`, data);
  }

  profilePhoto(userId: number) {
    return this.http.get(`${this.baseUrl}/profiles/${userId}/photo`, { responseType: 'blob' });
  }

  interests() {
    return this.http.get<Interest[]>(`${this.baseUrl}/interests`);
  }

  sendInterest(receiverUserId: number) {
    return this.http.post<{ id: number; status: InterestStatus }>(`${this.baseUrl}/interests`, { receiverUserId });
  }

  respondToInterest(id: number, status: 'Accepted' | 'Declined') {
    return this.http.patch<{ id: number; status: InterestStatus }>(`${this.baseUrl}/interests/${id}`, { status });
  }
}
