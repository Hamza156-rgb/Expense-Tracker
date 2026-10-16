import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { AccountMode, TourMember, WorkspaceScope } from '../../models/models';
import { toWorkspaceId } from '../../utils/workspace.util';

@Component({
  selector: 'app-workspace-mode',
  templateUrl: './workspace-mode.page.html',
  styleUrls: ['./workspace-mode.page.scss']
})
export class WorkspaceModePage implements OnInit {
  selectedMode: AccountMode = 'personal';
  businessName = '';
  userId = '';
  existingBusinessWorkspaceId = '';
  tourName = '';
  existingTourWorkspaceId = '';
  tourMembers: TourMember[] = [];
  newMemberName = '';

  constructor(
    private authService: AuthService,
    private afs: AngularFirestore,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private categoryService: CategoryService
  ) {}

  async ngOnInit() {
    const user = await this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = user.uid;

    const doc = await this.afs.doc(`users/${user.uid}`).ref.get();
    const data = doc.data() as any;
    if (data?.accountMode) {
      this.selectedMode = data.accountMode;
    }
    if (data?.businessName) {
      this.businessName = data.businessName;
    }
    if (data?.businessWorkspaceId) {
      this.existingBusinessWorkspaceId = data.businessWorkspaceId;
    }
    if (data?.tourName) {
      this.tourName = data.tourName;
    }
    if (data?.tourWorkspaceId) {
      this.existingTourWorkspaceId = data.tourWorkspaceId;
    }
    if (Array.isArray(data?.tourMembers)) {
      this.tourMembers = data.tourMembers;
    } else if (data?.firstName) {
      // Start a new tour with the user as its first member.
      this.tourMembers = [{ id: this.newMemberId(), name: data.firstName }];
    }
  }

  get modeLabel(): string {
    if (this.selectedMode === 'business') return 'Business';
    if (this.selectedMode === 'tour') return 'Tour';
    return 'Personal';
  }

  addMember() {
    const name = this.newMemberName.trim();
    if (!name) return;
    if (this.tourMembers.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      this.showToast('A member with this name already exists.', 'warning');
      return;
    }
    this.tourMembers = [...this.tourMembers, { id: this.newMemberId(), name }];
    this.newMemberName = '';
  }

  async removeMember(member: TourMember) {
    const alert = await this.alertCtrl.create({
      header: 'Remove Member',
      message: `Remove ${member.name} from the tour? Expenses they already paid will keep their name.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.tourMembers = this.tourMembers.filter(m => m.id !== member.id);
          }
        }
      ]
    });
    await alert.present();
  }

  trackByMember(index: number, member: TourMember) {
    return member.id;
  }

  async saveMode() {
    if (!this.userId) return;

    if (this.selectedMode === 'business' && !this.businessName.trim()) {
      this.showToast('Please enter a shop name for business mode.', 'warning');
      return;
    }

    if (this.selectedMode === 'tour') {
      if (!this.tourName.trim()) {
        this.showToast('Please enter a tour name for tour mode.', 'warning');
        return;
      }
      if (this.tourMembers.length === 0) {
        this.showToast('Please add at least one tour member.', 'warning');
        return;
      }
    }

    const loading = await this.loadingCtrl.create({ message: 'Saving mode...' });
    await loading.present();

    try {
      const shopName = this.businessName.trim();
      const payload: any = {
        accountMode: this.selectedMode,
        updatedAt: new Date()
      };

      // Preserve business/tour profile values when user temporarily switches to another mode.
      if (this.selectedMode === 'business') {
        const workspaceId = this.existingBusinessWorkspaceId || toWorkspaceId('shop', shopName);
        payload.businessName = shopName;
        payload.businessWorkspaceId = workspaceId;

        await this.seedCategoriesIfMissing({ workspaceType: 'business', workspaceId });
      }

      if (this.selectedMode === 'tour') {
        const tourName = this.tourName.trim();
        const workspaceId = this.existingTourWorkspaceId || toWorkspaceId('tour', tourName);
        payload.tourName = tourName;
        payload.tourWorkspaceId = workspaceId;
        payload.tourMembers = this.tourMembers;

        await this.seedCategoriesIfMissing({ workspaceType: 'tour', workspaceId });
      }

      await this.afs.doc(`users/${this.userId}`).set(payload, { merge: true });

      await loading.dismiss();
      await this.showToast('Mode updated successfully!', 'success');
      this.router.navigate(['/tabs/profile']);
    } catch {
      await loading.dismiss();
      await this.showToast('Failed to update mode. Try again.', 'danger');
    }
  }

  goBack() {
    this.router.navigate(['/tabs/profile']);
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color, position: 'top' });
    await toast.present();
  }

  private async seedCategoriesIfMissing(scope: WorkspaceScope) {
    // Check if categories already exist for this workspace
    const categoriesRef = this.afs.collection('categories', ref =>
      ref.where('userId', '==', this.userId)
         .where('workspaceId', '==', scope.workspaceId)
         .limit(1)
    );
    const categoriesSnapshot = await categoriesRef.get().toPromise();

    if (categoriesSnapshot && categoriesSnapshot.empty) {
      // No categories found, seed defaults for this workspace
      await this.categoryService.seedDefaultCategories(this.userId, scope);
    }
  }

  private newMemberId(): string {
    return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}
