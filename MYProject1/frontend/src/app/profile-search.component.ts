import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';
import { AdminUser, ApiService, Interest, InterestStatus, Profile, ProfileInput, SubscriptionPayment, SubscriptionPlan, SubscriptionRecord } from './api.service';
import { AgePipe } from './age.pipe';
import { environment } from '../environments/environment';

interface WelcomeSlide {
  imageUrl: string;
  imageAlt: string;
  eyebrow: string;
  heading: string;
  emphasis: string;
  caption: string;
}

@Component({
  selector: 'app-profile-search',
  standalone: true,
  imports: [CommonModule, FormsModule, AgePipe],
  templateUrl: './profile-search.component.html',
  styleUrls: ['./profile-search.component.css', './admin-dashboard.component.css', './subscription.component.css', './welcome-slider.component.css', './site-header.component.css', './account-review.component.css'],
})
export class ProfileSearchComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly zone = inject(NgZone);
  private socket?: Socket;
  private welcomeTimer?: ReturnType<typeof setInterval>;

  readonly welcomeSlides: WelcomeSlide[] = [
    {
      imageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=85',
      imageAlt: 'Couple celebrating their wedding outdoors',
      eyebrow: 'A GOOD BEGINNING',
      heading: 'Meet someone',
      emphasis: 'meaningful.',
      caption: 'A thoughtful introduction can change everything.',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1600&q=85',
      imageAlt: 'Newly married couple sharing a joyful moment',
      eyebrow: 'YOUR NEXT CHAPTER',
      heading: 'Make room for',
      emphasis: 'a little wonder.',
      caption: 'Find the person who makes ordinary days feel bright.',
    },
    {
      imageUrl: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1600&q=85',
      imageAlt: 'Wedding couple holding hands during their ceremony',
      eyebrow: 'CLOSER, TOGETHER',
      heading: 'Start with',
      emphasis: 'a hello.',
      caption: 'Shared values. Honest conversations. A future of your own.',
    },
  ];

  authenticated = false;
  authMode: 'login' | 'register' = 'register';
  authBusy = false;
  authError = '';
  email = '';
  password = '';
  phone = '';
  currentEmail = '';
  currentName = '';
  currentUserId: number | null = null;
  currentUserRole: 'user' | 'admin' = 'user';
  currentProfilePhotoUrl = '';
  accountStatus = 'Pending';
  activeView: 'discover' | 'interests' | 'admin' | 'subscription' | 'adminBilling' = 'discover';
  hasActiveSubscription = false;
  subscriptionPlans: SubscriptionPlan[] = [];
  currentSubscription: SubscriptionRecord | null = null;
  subscriptionBusy = false;
  subscriptionError = '';
  selectedPlanId: number | null = null;
  transactionReference = '';
  adminPlans: SubscriptionPlan[] = [];
  adminPayments: SubscriptionPayment[] = [];
  adminPlanPrices: Record<number, number | null> = {};
  adminPlanCurrencies: Record<number, string> = {};
  adminBillingLoading = false;
  loading = false;
  saving = false;
  errorMessage = '';
  notice = '';
  profiles: Profile[] = [];
  profilePage = 1;
  profileTotal = 0;
  readonly profilePageSize = 5;
  interestsList: Interest[] = [];
  adminUsers: AdminUser[] = [];
  adminLoading = false;
  adminError = '';
  adminFilter = '';
  photoUrls: Record<number, string> = {};
  pendingPhoto: File | null = null;
  profileStep = 1;
  showProfileForm = false;
  hasProfile = false;
  profileForm: ProfileInput = this.emptyProfile();
  filters = {
    gender: '', region: '', minAge: 21, maxAge: 35,
    education: '', profession: '', star: '', rasi: '',
    minHeight: '', maxHeight: '',
  };

  ngOnInit(): void {
    const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('token');
    if (token) {
      this.authenticated = true;
      this.currentEmail = localStorage.getItem('email') ?? '';
      this.currentUserId = Number(localStorage.getItem('userId')) || null;
      this.currentUserRole = localStorage.getItem('role') === 'admin' ? 'admin' : 'user';
      this.currentName = this.currentUserRole === 'admin' ? 'Admin' : 'Member';
      this.accountStatus = localStorage.getItem('accountStatus') ?? 'Pending';
      this.connectRealtime(token);
      this.loadAuthenticatedView();
    } else {
      this.startWelcomeCarousel();
    }
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
    this.stopWelcomeCarousel();
    this.releasePhotoUrls();
  }

  submitAuth(): void {
    this.authBusy = true;
    this.authError = '';
    const request = this.authMode === 'register'
      ? this.api.register({ email: this.email, password: this.password, phone: this.phone })
      : this.api.login({ email: this.email, password: this.password });
    request.subscribe({
      next: (result) => {
        localStorage.setItem('token', result.token);
        localStorage.setItem('email', result.user.email);
        localStorage.setItem('userId', String(result.user.id));
        localStorage.setItem('role', result.user.role);
        localStorage.setItem('accountStatus', result.user.accountStatus);
        this.authenticated = true;
        this.currentEmail = result.user.email;
        this.currentUserId = result.user.id;
        this.currentUserRole = result.user.role;
        this.currentName = result.user.role === 'admin' ? 'Admin' : 'Member';
        this.currentProfilePhotoUrl = '';
        this.activeView = 'discover';
        this.showProfileForm = false;
        this.accountStatus = result.user.accountStatus;
        this.authBusy = false;
        this.stopWelcomeCarousel();
        this.connectRealtime(result.token);
        this.loadAuthenticatedView();
      },
      error: (error: { error?: { error?: string } }) => {
        this.authBusy = false;
        this.authError = error.error?.error ?? 'We could not sign you in. Check your details and try again.';
      },
    });
  }

  logout(): void {
    this.socket?.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    localStorage.removeItem('userId');
    localStorage.removeItem('role');
    localStorage.removeItem('accountStatus');
    this.authenticated = false;
    this.currentEmail = '';
    this.currentName = '';
    this.currentUserId = null;
    this.currentUserRole = 'user';
    this.currentProfilePhotoUrl = '';
    this.profiles = [];
    this.interestsList = [];
    this.adminUsers = [];
    this.adminFilter = '';
    this.currentSubscription = null;
    this.hasActiveSubscription = false;
    this.adminPayments = [];
    this.releasePhotoUrls();
    this.startWelcomeCarousel();
  }

  setWelcomeSlide(index: number): void {
    const slideCount = this.welcomeSlides.length;
    this.welcomeSlideIndex = (index + slideCount) % slideCount;
  }

  private startWelcomeCarousel(): void {
    this.stopWelcomeCarousel();
    this.welcomeTimer = setInterval(() => this.setWelcomeSlide(this.welcomeSlideIndex + 1), 6500);
  }

  private stopWelcomeCarousel(): void {
    if (this.welcomeTimer) clearInterval(this.welcomeTimer);
    this.welcomeTimer = undefined;
  }

  welcomeSlideIndex = 0;

  loadProfiles(page = 1): void {
    this.loading = true;
    this.errorMessage = '';
    this.profilePage = page;
    const filters: Record<string, string | number> = {
      page,
      gender: this.filters.gender,
      region: this.filters.region,
      minAge: this.filters.minAge,
      maxAge: this.filters.maxAge,
      education: this.filters.education,
      profession: this.filters.profession,
      star: this.filters.star,
      rasi: this.filters.rasi,
      minHeight: this.filters.minHeight,
      maxHeight: this.filters.maxHeight,
    };
    this.api.search(filters).subscribe({
      next: (result) => {
        this.profiles = result.profiles;
        this.profileTotal = result.total;
        this.profilePage = result.page;
        this.loading = false;
        for (const profile of result.profiles) {
          if (profile.has_photo && !profile.profile_photo_url) this.loadPrivatePhoto(profile.user_id);
        }
      },
      error: (error: { error?: { error?: string } }) => {
        this.loading = false;
        this.errorMessage = error.error?.error ?? 'Search is unavailable right now. Please try again.';
      },
    });
  }

  get profilePageCount(): number {
    return Math.max(1, Math.ceil(this.profileTotal / this.profilePageSize));
  }

  get profileResultStart(): number {
    return this.profileTotal ? (this.profilePage - 1) * this.profilePageSize + 1 : 0;
  }

  get profileResultEnd(): number {
    return Math.min(this.profilePage * this.profilePageSize, this.profileTotal);
  }

  loadProfile(): void {
    this.api.myProfile().subscribe({
      next: (profile) => {
        if (!profile) {
          this.hasProfile = false;
          this.currentName = this.currentUserRole === 'admin' ? 'Admin' : 'Member';
          this.currentProfilePhotoUrl = '';
          return;
        }
        this.hasProfile = true;
        this.currentUserId = profile.user_id;
        this.currentName = `${profile.first_name} ${profile.last_name}`.trim();
        this.currentProfilePhotoUrl = profile.profile_photo_url ?? '';
        if (profile.has_photo && !profile.profile_photo_url) this.loadPrivatePhoto(profile.user_id);
        this.profileForm = {
          ...profile,
          date_of_birth: profile.date_of_birth.slice(0, 10),
          height_cm: profile.height_cm ?? 0,
          religion: profile.religion || 'Hindu',
          mother_tongue: profile.mother_tongue || 'Telugu',
          caste_community: profile.caste_community ?? '',
          gothram: profile.gothram ?? '', rasi: profile.rasi ?? '',
          star_nakshatram: profile.star_nakshatram ?? '',
          education: profile.education ?? '', profession: profile.profession ?? '',
          annual_income: profile.annual_income ?? 0, family_details: profile.family_details ?? '',
          profile_photo_url: profile.profile_photo_url ?? '', bio: profile.bio ?? '',
        };
      },
      error: () => { this.hasProfile = false; },
    });
  }

  saveProfile(): void {
    this.saving = true;
    this.notice = '';
    this.api.saveProfile(this.profileForm).subscribe({
      next: (profile) => {
        this.profileForm = { ...this.profileForm, ...profile, date_of_birth: profile.date_of_birth.slice(0, 10) };
        this.hasProfile = true;
        this.currentName = `${profile.first_name} ${profile.last_name}`.trim();
        this.currentProfilePhotoUrl = profile.profile_photo_url ?? '';
        this.showProfileForm = false;
        this.saving = false;
        this.notice = 'Your profile is live. You can update it any time.';
        this.accountStatus = 'Active';
        localStorage.setItem('accountStatus', 'Active');
        if (this.pendingPhoto) {
          const photo = this.pendingPhoto;
          this.pendingPhoto = null;
          this.uploadPhoto(profile.user_id, photo);
        }
        this.loadProfiles();
      },
      error: (error: { error?: { error?: string } }) => {
        this.saving = false;
        this.errorMessage = error.error?.error ?? 'We could not save your profile. Please check the required fields.';
      },
    });
  }

  advanceProfileStep(form: HTMLFormElement): void {
    if (form.reportValidity()) this.profileStep = Math.min(this.profileStep + 1, 3);
  }

  loadInterests(): void {
    if (!this.hasActiveSubscription) return;
    this.api.interests().subscribe({
      next: (items) => { this.interestsList = items; },
      error: () => { this.interestsList = []; },
    });
  }

  loadAdminUsers(): void {
    this.adminLoading = true;
    this.adminError = '';
    this.api.adminUsers().subscribe({
      next: (users) => {
        this.adminUsers = users;
        this.adminLoading = false;
        for (const user of users) {
          if (user.has_photo) this.loadPrivatePhoto(user.id);
        }
      },
      error: (error: { error?: { error?: string } }) => {
        this.adminLoading = false;
        this.adminError = error.error?.error ?? 'Could not load member records.';
      },
    });
  }

  setAdminAccountStatus(user: AdminUser, accountStatus: 'Active' | 'Suspended'): void {
    this.api.setAccountStatus(user.id, accountStatus).subscribe({
      next: () => {
        this.adminUsers = this.adminUsers.map((item) => item.id === user.id ? { ...item, account_status: accountStatus } : item);
        this.notice = accountStatus === 'Active' ? 'Account activated.' : 'Account deactivated.';
      },
      error: (error: { error?: { error?: string } }) => {
        this.adminError = error.error?.error ?? 'Could not update account status.';
      },
    });
  }

  loadSubscription(): void {
    this.subscriptionError = '';
    this.api.subscriptionPlans().subscribe({
      next: (plans) => { this.subscriptionPlans = plans; },
      error: () => { this.subscriptionError = 'Subscription plans are unavailable right now.'; },
    });
    this.api.mySubscription().subscribe({
      next: (subscription) => {
        this.currentSubscription = subscription;
        this.hasActiveSubscription = subscription?.status === 'Active'
          && Boolean(subscription.ends_at)
          && new Date(subscription.ends_at as string).getTime() > Date.now();
        if (this.hasActiveSubscription) {
          this.activeView = 'discover';
          this.loadProfiles();
          this.loadInterests();
        } else {
          this.activeView = 'subscription';
          this.profiles = [];
          this.interestsList = [];
        }
      },
      error: () => { this.subscriptionError = 'Could not load your subscription status.'; },
    });
  }

  submitSubscriptionRequest(): void {
    if (this.selectedPlanId === null || !this.transactionReference.trim()) return;
    this.subscriptionBusy = true;
    this.subscriptionError = '';
    this.api.requestSubscription(this.selectedPlanId, this.transactionReference.trim()).subscribe({
      next: () => {
        this.subscriptionBusy = false;
        this.transactionReference = '';
        this.notice = 'Payment reference submitted. Search unlocks after admin approval.';
        this.loadSubscription();
      },
      error: (error: { error?: { error?: string } }) => {
        this.subscriptionBusy = false;
        this.subscriptionError = error.error?.error ?? 'Could not submit payment details.';
      },
    });
  }

  loadAdminBilling(): void {
    this.adminBillingLoading = true;
    this.adminError = '';
    this.api.adminSubscriptionPlans().subscribe({
      next: (plans) => {
        this.adminPlans = plans;
        for (const plan of plans) {
          this.adminPlanPrices[plan.id] = plan.amount === null ? null : Number(plan.amount);
          this.adminPlanCurrencies[plan.id] = plan.currency;
        }
        this.adminBillingLoading = false;
      },
      error: (error: { error?: { error?: string } }) => {
        this.adminBillingLoading = false;
        this.adminError = error.error?.error ?? 'Could not load subscription plans.';
      },
    });
    this.api.adminSubscriptionPayments().subscribe({
      next: (payments) => { this.adminPayments = payments; },
      error: (error: { error?: { error?: string } }) => {
        this.adminError = error.error?.error ?? 'Could not load payment records.';
      },
    });
  }

  savePlanPrice(plan: SubscriptionPlan): void {
    const amount = this.adminPlanPrices[plan.id];
    if (amount === null || amount === undefined) return;
    this.api.updateSubscriptionPlan(plan.id, amount, this.adminPlanCurrencies[plan.id] || 'INR').subscribe({
      next: () => {
        this.notice = `${plan.name} price saved.`;
        this.loadAdminBilling();
      },
      error: (error: { error?: { error?: string } }) => {
        this.adminError = error.error?.error ?? 'Could not update plan price.';
      },
    });
  }

  reviewPayment(payment: SubscriptionPayment, status: 'Approved' | 'Rejected'): void {
    this.api.reviewSubscriptionPayment(payment.id, status, '').subscribe({
      next: () => {
        this.notice = status === 'Approved' ? 'Payment approved; subscription is active.' : 'Payment rejected.';
        this.loadAdminBilling();
      },
      error: (error: { error?: { error?: string } }) => {
        this.adminError = error.error?.error ?? 'Could not review this payment.';
      },
    });
  }

  private loadAuthenticatedView(): void {
    if (this.currentUserRole === 'admin') {
      this.activeView = 'admin';
      this.loadAdminUsers();
      this.loadAdminBilling();
      return;
    }
    this.loadProfile();
    this.loadSubscription();
  }

  get filteredAdminUsers(): AdminUser[] {
    const query = this.adminFilter.trim().toLowerCase();
    if (!query) return this.adminUsers;
    return this.adminUsers.filter((user) => [
      user.first_name, user.last_name, user.email, user.phone, user.current_city,
      user.native_district, user.profession, user.caste_community, user.account_status,
    ].some((value) => value?.toLowerCase().includes(query)));
  }

  sendInterest(profile: Profile): void {
    this.api.sendInterest(profile.user_id).subscribe({
      next: () => {
        this.notice = `Your interest was sent to ${profile.first_name}.`;
        this.loadInterests();
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage = error.error?.error ?? 'Interest could not be sent.';
      },
    });
  }

  respond(id: number, status: Extract<InterestStatus, 'Accepted' | 'Declined'>): void {
    this.api.respondToInterest(id, status).subscribe({
      next: () => { this.notice = status === 'Accepted' ? 'You accepted this interest.' : 'You declined this interest.'; this.loadInterests(); },
      error: (error: { error?: { error?: string } }) => { this.errorMessage = error.error?.error ?? 'Your response could not be saved.'; },
    });
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      this.errorMessage = 'Choose a JPEG, PNG, or WebP photo up to 2 MB.';
      input.value = '';
      return;
    }
    this.pendingPhoto = file;
    this.profileForm.profile_photo_url = '';
    this.notice = 'Photo selected. Save your profile to upload it.';
  }

  initials(profile: Profile): string {
    return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
  }

  get incomingCount(): number {
    return this.interestsList.filter((item) => item.direction === 'incoming' && item.status === 'Requested').length;
  }

  get signedInPhotoUrl(): string | null {
    return this.currentUserId === null
      ? this.currentProfilePhotoUrl || null
      : this.photoUrls[this.currentUserId] || this.currentProfilePhotoUrl || null;
  }

  get signedInInitials(): string {
    return this.currentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'M';
  }

  private connectRealtime(token: string): void {
    this.socket?.disconnect();
    this.socket = io(environment.apiUrl.replace(/\/api\/?$/, ''), { auth: { token } });
    this.socket.on('interest:new', () => this.zone.run(() => {
      this.notice = 'You have a new expression of interest.';
      this.loadInterests();
    }));
    this.socket.on('interest:updated', () => this.zone.run(() => this.loadInterests()));
  }

  private loadPrivatePhoto(userId: number): void {
    this.api.profilePhoto(userId).subscribe({
      next: (photo) => {
        const previousUrl = this.photoUrls[userId];
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.photoUrls[userId] = URL.createObjectURL(photo);
      },
    });
  }

  private uploadPhoto(userId: number, photo: File): void {
    this.api.uploadProfilePhoto(photo).subscribe({
      next: () => {
        this.notice = 'Your photo has been added to your profile.';
        this.loadPrivatePhoto(userId);
        this.loadProfile();
      },
      error: (error: { error?: { error?: string } }) => {
        this.errorMessage = error.error?.error ?? 'We could not upload that photo.';
      },
    });
  }

  private releasePhotoUrls(): void {
    for (const url of Object.values(this.photoUrls)) URL.revokeObjectURL(url);
    this.photoUrls = {};
  }

  private emptyProfile(): ProfileInput {
    return {
      first_name: '', last_name: '', gender: 'Female', date_of_birth: '', height_cm: 0,
      religion: 'Hindu', caste_community: '', gothram: '', rasi: '', star_nakshatram: '',
      mother_tongue: 'Telugu', native_district: '', current_city: '', education: '',
      profession: '', annual_income: 0, family_details: '', profile_photo_url: '', bio: '',
    };
  }
}
