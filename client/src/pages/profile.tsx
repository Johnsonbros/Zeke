import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  User,
  Briefcase,
  Users,
  Heart,
  Target,
  Activity,
  Clock,
  Calendar,
  Settings,
  Plus,
  Trash2,
  Save,
  Coffee,
  Moon,
  Sun,
  Music,
  Film,
  Book,
  Plane,
  Dumbbell,
  X,
} from "lucide-react";
import type {
  FullProfile,
  BasicInfoData,
  WorkData,
  FamilyData,
  FamilyMemberRef,
  InterestsData,
  PreferencesData,
  GoalsData,
  HealthData,
  RoutinesData,
  ImportantDateData,
  CustomFieldData,
} from "@shared/schema";
import { FamilyMemberInput } from "@/components/FamilyMemberInput";
import { GettingToKnowYouChat } from "@/components/GettingToKnowYouChat";

const SECTION_CONFIG = {
  basic_info: { label: "Basic Info", icon: User, color: "text-blue-500" },
  work: { label: "Work", icon: Briefcase, color: "text-green-500" },
  family: { label: "Family", icon: Users, color: "text-pink-500" },
  interests: { label: "Interests", icon: Heart, color: "text-red-500" },
  preferences: { label: "Preferences", icon: Settings, color: "text-purple-500" },
  goals: { label: "Goals", icon: Target, color: "text-yellow-500" },
  health: { label: "Health", icon: Activity, color: "text-emerald-500" },
  routines: { label: "Routines", icon: Clock, color: "text-orange-500" },
  important_dates: { label: "Important Dates", icon: Calendar, color: "text-cyan-500" },
  custom: { label: "Custom Fields", icon: Settings, color: "text-gray-500" },
};

function ArrayInput({
  items,
  onChange,
  placeholder,
  testIdPrefix,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()]);
      setNewItem("");
    }
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 sm:gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          onKeyPress={(e) => e.key === "Enter" && addItem()}
          className="text-sm"
          data-testid={`input-${testIdPrefix}-new`}
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 sm:h-10 sm:w-10 shrink-0"
          onClick={addItem}
          data-testid={`button-add-${testIdPrefix}`}
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {items.map((item, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="gap-0.5 sm:gap-1 pr-0.5 sm:pr-1 text-xs sm:text-sm"
          >
            <span data-testid={`text-${testIdPrefix}-${index}`}>{item}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 p-0"
              onClick={() => removeItem(index)}
              data-testid={`button-remove-${testIdPrefix}-${index}`}
            >
              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function BasicInfoSection({
  data,
  onSave,
  isSaving,
}: {
  data: BasicInfoData;
  onSave: (data: BasicInfoData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<BasicInfoData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof BasicInfoData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Full Name</label>
          <Input
            value={formData.fullName || ""}
            onChange={(e) => handleChange("fullName", e.target.value)}
            placeholder="Your full name"
            className="text-sm"
            data-testid="input-fullName"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Nickname</label>
          <Input
            value={formData.nickname || ""}
            onChange={(e) => handleChange("nickname", e.target.value)}
            placeholder="What should ZEKE call you?"
            className="text-sm"
            data-testid="input-nickname"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Email</label>
          <Input
            type="email"
            value={formData.email || ""}
            onChange={(e) => handleChange("email", e.target.value)}
            placeholder="your@email.com"
            className="text-sm"
            data-testid="input-email"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Phone</label>
          <Input
            value={formData.phone || ""}
            onChange={(e) => handleChange("phone", e.target.value)}
            placeholder="(555) 555-5555"
            className="text-sm"
            data-testid="input-phone"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Location</label>
          <Input
            value={formData.location || ""}
            onChange={(e) => handleChange("location", e.target.value)}
            placeholder="City, State"
            className="text-sm"
            data-testid="input-location"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Birthday</label>
          <Input
            type="date"
            value={formData.birthday || ""}
            onChange={(e) => handleChange("birthday", e.target.value)}
            className="text-sm"
            data-testid="input-birthday"
          />
        </div>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm font-medium">Bio</label>
        <Textarea
          value={formData.bio || ""}
          onChange={(e) => handleChange("bio", e.target.value)}
          placeholder="Tell ZEKE about yourself..."
          rows={3}
          className="text-sm"
          data-testid="input-bio"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        className="w-full sm:w-auto"
        data-testid="button-save-basic_info"
      >
        <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
        {isSaving ? "Saving..." : "Save Basic Info"}
      </Button>
    </div>
  );
}

function WorkSection({
  data,
  onSave,
  isSaving,
}: {
  data: WorkData;
  onSave: (data: WorkData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<WorkData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof WorkData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Company</label>
          <Input
            value={formData.company || ""}
            onChange={(e) => handleChange("company", e.target.value)}
            placeholder="Where do you work?"
            className="text-sm"
            data-testid="input-company"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Role</label>
          <Input
            value={formData.role || ""}
            onChange={(e) => handleChange("role", e.target.value)}
            placeholder="Your job title"
            className="text-sm"
            data-testid="input-role"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Industry</label>
          <Input
            value={formData.industry || ""}
            onChange={(e) => handleChange("industry", e.target.value)}
            placeholder="e.g., Technology, Healthcare"
            className="text-sm"
            data-testid="input-industry"
          />
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <label className="text-xs sm:text-sm font-medium">Work Schedule</label>
          <Input
            value={formData.workSchedule || ""}
            onChange={(e) => handleChange("workSchedule", e.target.value)}
            placeholder="e.g., 9-5 M-F, Flexible"
            className="text-sm"
            data-testid="input-workSchedule"
          />
        </div>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm font-medium">Work Style</label>
        <Textarea
          value={formData.workStyle || ""}
          onChange={(e) => handleChange("workStyle", e.target.value)}
          placeholder="How do you like to work? Remote, hybrid, in-office?"
          rows={2}
          className="text-sm"
          data-testid="input-workStyle"
        />
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm font-medium">Career Goals</label>
        <Textarea
          value={formData.careerGoals || ""}
          onChange={(e) => handleChange("careerGoals", e.target.value)}
          placeholder="What are your professional aspirations?"
          rows={2}
          className="text-sm"
          data-testid="input-careerGoals"
        />
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Any other work-related notes..."
          rows={2}
          className="text-sm"
          data-testid="input-work-notes"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        className="w-full sm:w-auto"
        data-testid="button-save-work"
      >
        <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
        {isSaving ? "Saving..." : "Save Work Info"}
      </Button>
    </div>
  );
}

function FamilySection({
  data,
  onSave,
  isSaving,
}: {
  data: FamilyData;
  onSave: (data: FamilyData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<FamilyData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (
    field: keyof FamilyData,
    value: string | string[] | FamilyMemberRef | FamilyMemberRef[] | undefined
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Relationship Status</label>
          <Input
            value={formData.relationshipStatus || ""}
            onChange={(e) => handleChange("relationshipStatus", e.target.value)}
            placeholder="e.g., Married, Single, Dating"
            data-testid="input-relationshipStatus"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Spouse/Partner</label>
          <FamilyMemberInput
            value={formData.spouse}
            onChange={(value) => handleChange("spouse", value)}
            placeholder="Type name or @contact"
            testIdPrefix="spouse"
            mode="single"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Parents</label>
          <FamilyMemberInput
            value={formData.parents}
            onChange={(value) => handleChange("parents", value)}
            placeholder="Type name or @contact"
            testIdPrefix="parents"
            mode="array"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Siblings</label>
          <FamilyMemberInput
            value={formData.siblings}
            onChange={(value) => handleChange("siblings", value)}
            placeholder="Type name or @contact"
            testIdPrefix="siblings"
            mode="array"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Children</label>
        <FamilyMemberInput
          value={formData.children}
          onChange={(value) => handleChange("children", value)}
          placeholder="Type name or @contact"
          testIdPrefix="children"
          mode="array"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Pets</label>
        <ArrayInput
          items={formData.pets || []}
          onChange={(items) => handleChange("pets", items)}
          placeholder="Add a pet's name and type"
          testIdPrefix="pets"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Any other family notes..."
          rows={2}
          data-testid="input-family-notes"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-family"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Family Info"}
      </Button>
    </div>
  );
}

function InterestsSection({
  data,
  onSave,
  isSaving,
}: {
  data: InterestsData;
  onSave: (data: InterestsData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<InterestsData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof InterestsData, value: string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          Hobbies
        </label>
        <ArrayInput
          items={formData.hobbies || []}
          onChange={(items) => handleChange("hobbies", items)}
          placeholder="Add a hobby"
          testIdPrefix="hobbies"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-green-500" />
          Sports
        </label>
        <ArrayInput
          items={formData.sports || []}
          onChange={(items) => handleChange("sports", items)}
          placeholder="Add a sport"
          testIdPrefix="sports"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Music className="h-4 w-4 text-purple-500" />
          Music
        </label>
        <ArrayInput
          items={formData.music || []}
          onChange={(items) => handleChange("music", items)}
          placeholder="Add a music genre or artist"
          testIdPrefix="music"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Film className="h-4 w-4 text-blue-500" />
          Movies
        </label>
        <ArrayInput
          items={formData.movies || []}
          onChange={(items) => handleChange("movies", items)}
          placeholder="Add a movie genre or film"
          testIdPrefix="movies"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Book className="h-4 w-4 text-amber-500" />
          Books
        </label>
        <ArrayInput
          items={formData.books || []}
          onChange={(items) => handleChange("books", items)}
          placeholder="Add a book or author"
          testIdPrefix="books"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Plane className="h-4 w-4 text-cyan-500" />
          Travel
        </label>
        <ArrayInput
          items={formData.travel || []}
          onChange={(items) => handleChange("travel", items)}
          placeholder="Add a destination or travel preference"
          testIdPrefix="travel"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Other Interests</label>
        <ArrayInput
          items={formData.other || []}
          onChange={(items) => handleChange("other", items)}
          placeholder="Add another interest"
          testIdPrefix="other-interests"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-interests"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Interests"}
      </Button>
    </div>
  );
}

function PreferencesSection({
  data,
  onSave,
  isSaving,
}: {
  data: PreferencesData;
  onSave: (data: PreferencesData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<PreferencesData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof PreferencesData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Communication Style</label>
          <Input
            value={formData.communicationStyle || ""}
            onChange={(e) => handleChange("communicationStyle", e.target.value)}
            placeholder="e.g., Direct, Casual, Formal"
            data-testid="input-communicationStyle"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Coffee className="h-4 w-4 text-amber-700" />
            Coffee or Tea?
          </label>
          <Input
            value={formData.coffeeOrTea || ""}
            onChange={(e) => handleChange("coffeeOrTea", e.target.value)}
            placeholder="e.g., Coffee, Tea, Neither"
            data-testid="input-coffeeOrTea"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            {formData.morningOrNight === "night" ? (
              <Moon className="h-4 w-4 text-indigo-500" />
            ) : (
              <Sun className="h-4 w-4 text-yellow-500" />
            )}
            Morning or Night Person?
          </label>
          <Input
            value={formData.morningOrNight || ""}
            onChange={(e) => handleChange("morningOrNight", e.target.value)}
            placeholder="e.g., Morning person, Night owl"
            data-testid="input-morningOrNight"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Work From Home Preference</label>
          <Input
            value={formData.workFromHome || ""}
            onChange={(e) => handleChange("workFromHome", e.target.value)}
            placeholder="e.g., Prefer remote, Hybrid"
            data-testid="input-workFromHome"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Food Preferences</label>
        <Textarea
          value={formData.foodPreferences || ""}
          onChange={(e) => handleChange("foodPreferences", e.target.value)}
          placeholder="Favorite foods, cuisines, restaurants..."
          rows={2}
          data-testid="input-foodPreferences"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Dietary Restrictions</label>
        <ArrayInput
          items={formData.dietaryRestrictions || []}
          onChange={(items) => handleChange("dietaryRestrictions", items)}
          placeholder="Add a dietary restriction"
          testIdPrefix="dietaryRestrictions"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Other Preferences</label>
        <Textarea
          value={formData.other || ""}
          onChange={(e) => handleChange("other", e.target.value)}
          placeholder="Any other preferences ZEKE should know..."
          rows={2}
          data-testid="input-preferences-other"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-preferences"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
}

function GoalsSection({
  data,
  onSave,
  isSaving,
}: {
  data: GoalsData;
  onSave: (data: GoalsData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<GoalsData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof GoalsData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Short-Term Goals</label>
        <ArrayInput
          items={formData.shortTerm || []}
          onChange={(items) => handleChange("shortTerm", items)}
          placeholder="Add a short-term goal"
          testIdPrefix="shortTermGoals"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Long-Term Goals</label>
        <ArrayInput
          items={formData.longTerm || []}
          onChange={(items) => handleChange("longTerm", items)}
          placeholder="Add a long-term goal"
          testIdPrefix="longTermGoals"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Goals for This Year</label>
        <ArrayInput
          items={formData.thisYear || []}
          onChange={(items) => handleChange("thisYear", items)}
          placeholder="Add a goal for this year"
          testIdPrefix="thisYearGoals"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Goals for This Month</label>
        <ArrayInput
          items={formData.thisMonth || []}
          onChange={(items) => handleChange("thisMonth", items)}
          placeholder="Add a goal for this month"
          testIdPrefix="thisMonthGoals"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Any other notes about your goals..."
          rows={2}
          data-testid="input-goals-notes"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-goals"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Goals"}
      </Button>
    </div>
  );
}

function HealthSection({
  data,
  onSave,
  isSaving,
}: {
  data: HealthData;
  onSave: (data: HealthData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<HealthData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof HealthData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Exercise Routine</label>
          <Input
            value={formData.exerciseRoutine || ""}
            onChange={(e) => handleChange("exerciseRoutine", e.target.value)}
            placeholder="e.g., Gym 3x/week, Morning runs"
            data-testid="input-exerciseRoutine"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Sleep Schedule</label>
          <Input
            value={formData.sleepSchedule || ""}
            onChange={(e) => handleChange("sleepSchedule", e.target.value)}
            placeholder="e.g., 10pm-6am, Night owl"
            data-testid="input-sleepSchedule"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Diet</label>
        <Textarea
          value={formData.diet || ""}
          onChange={(e) => handleChange("diet", e.target.value)}
          placeholder="Describe your typical diet..."
          rows={2}
          data-testid="input-diet"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Allergies</label>
        <ArrayInput
          items={formData.allergies || []}
          onChange={(items) => handleChange("allergies", items)}
          placeholder="Add an allergy"
          testIdPrefix="allergies"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Medications</label>
        <Textarea
          value={formData.medications || ""}
          onChange={(e) => handleChange("medications", e.target.value)}
          placeholder="Current medications or supplements..."
          rows={2}
          data-testid="input-medications"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Any other health-related notes..."
          rows={2}
          data-testid="input-health-notes"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-health"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Health Info"}
      </Button>
    </div>
  );
}

function RoutinesSection({
  data,
  onSave,
  isSaving,
}: {
  data: RoutinesData;
  onSave: (data: RoutinesData) => void;
  isSaving: boolean;
}) {
  const [formData, setFormData] = useState<RoutinesData>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof RoutinesData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Sun className="h-4 w-4 text-yellow-500" />
          Morning Routine
        </label>
        <Textarea
          value={formData.morning || ""}
          onChange={(e) => handleChange("morning", e.target.value)}
          placeholder="Describe your typical morning routine..."
          rows={3}
          data-testid="input-morning-routine"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Moon className="h-4 w-4 text-indigo-500" />
          Evening Routine
        </label>
        <Textarea
          value={formData.evening || ""}
          onChange={(e) => handleChange("evening", e.target.value)}
          placeholder="Describe your typical evening routine..."
          rows={3}
          data-testid="input-evening-routine"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-green-500" />
          Workday
        </label>
        <Textarea
          value={formData.workday || ""}
          onChange={(e) => handleChange("workday", e.target.value)}
          placeholder="What does a typical workday look like?"
          rows={3}
          data-testid="input-workday-routine"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Coffee className="h-4 w-4 text-amber-700" />
          Weekend
        </label>
        <Textarea
          value={formData.weekend || ""}
          onChange={(e) => handleChange("weekend", e.target.value)}
          placeholder="What does a typical weekend look like?"
          rows={3}
          data-testid="input-weekend-routine"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Any other routine-related notes..."
          rows={2}
          data-testid="input-routines-notes"
        />
      </div>
      <Button
        onClick={() => onSave(formData)}
        disabled={isSaving}
        data-testid="button-save-routines"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Routines"}
      </Button>
    </div>
  );
}

function ImportantDatesSection({
  data,
  onSave,
  isSaving,
}: {
  data: ImportantDateData[];
  onSave: (data: ImportantDateData[]) => void;
  isSaving: boolean;
}) {
  const [dates, setDates] = useState<ImportantDateData[]>(data || []);
  const [newDate, setNewDate] = useState<ImportantDateData>({
    name: "",
    date: "",
    type: "birthday",
    recurring: true,
  });

  const addDate = () => {
    if (newDate.name.trim() && newDate.date) {
      setDates([...dates, { ...newDate }]);
      setNewDate({ name: "", date: "", type: "birthday", recurring: true });
    }
  };

  const removeDate = (index: number) => {
    setDates(dates.filter((_, i) => i !== index));
  };

  const updateDate = (index: number, field: keyof ImportantDateData, value: string | boolean) => {
    setDates(dates.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="text-sm font-medium mb-3">Add New Date</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            value={newDate.name}
            onChange={(e) => setNewDate({ ...newDate, name: e.target.value })}
            placeholder="Event name"
            data-testid="input-new-date-name"
          />
          <Input
            type="date"
            value={newDate.date}
            onChange={(e) => setNewDate({ ...newDate, date: e.target.value })}
            data-testid="input-new-date-date"
          />
          <Input
            value={newDate.type}
            onChange={(e) => setNewDate({ ...newDate, type: e.target.value })}
            placeholder="Type (birthday, anniversary...)"
            data-testid="input-new-date-type"
          />
          <Button onClick={addDate} data-testid="button-add-important-date">
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </Card>

      {dates.length > 0 ? (
        <div className="space-y-3">
          {dates.map((dateItem, index) => (
            <Card key={index} className="p-4" data-testid={`important-date-${index}`}>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    value={dateItem.name}
                    onChange={(e) => updateDate(index, "name", e.target.value)}
                    placeholder="Event name"
                    data-testid={`input-date-name-${index}`}
                  />
                  <Input
                    type="date"
                    value={dateItem.date}
                    onChange={(e) => updateDate(index, "date", e.target.value)}
                    data-testid={`input-date-date-${index}`}
                  />
                  <Input
                    value={dateItem.type}
                    onChange={(e) => updateDate(index, "type", e.target.value)}
                    placeholder="Type"
                    data-testid={`input-date-type-${index}`}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">
                      Recurring
                    </label>
                    <input
                      type="checkbox"
                      checked={dateItem.recurring}
                      onChange={(e) => updateDate(index, "recurring", e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      data-testid={`input-date-recurring-${index}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeDate(index)}
                      className="text-destructive"
                      data-testid={`button-remove-date-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-4">
          No important dates added yet. Add birthdays, anniversaries, and other special dates above.
        </p>
      )}

      <Button
        onClick={() => onSave(dates)}
        disabled={isSaving}
        data-testid="button-save-important_dates"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Important Dates"}
      </Button>
    </div>
  );
}

function CustomFieldsSection({
  data,
  onSave,
  isSaving,
}: {
  data: CustomFieldData[];
  onSave: (data: CustomFieldData[]) => void;
  isSaving: boolean;
}) {
  const [fields, setFields] = useState<CustomFieldData[]>(data || []);
  const [newField, setNewField] = useState<CustomFieldData>({ label: "", value: "" });

  const addField = () => {
    if (newField.label.trim() && newField.value.trim()) {
      setFields([...fields, { ...newField }]);
      setNewField({ label: "", value: "" });
    }
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: keyof CustomFieldData, value: string) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="text-sm font-medium mb-3">Add Custom Field</h4>
        <div className="flex gap-3">
          <Input
            value={newField.label}
            onChange={(e) => setNewField({ ...newField, label: e.target.value })}
            placeholder="Label (e.g., Favorite Color)"
            className="flex-1"
            data-testid="input-new-custom-label"
          />
          <Input
            value={newField.value}
            onChange={(e) => setNewField({ ...newField, value: e.target.value })}
            placeholder="Value (e.g., Blue)"
            className="flex-1"
            data-testid="input-new-custom-value"
          />
          <Button onClick={addField} data-testid="button-add-custom-field">
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </Card>

      {fields.length > 0 ? (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <Card key={index} className="p-4" data-testid={`custom-field-${index}`}>
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input
                  value={field.label}
                  onChange={(e) => updateField(index, "label", e.target.value)}
                  placeholder="Label"
                  className="flex-1"
                  data-testid={`input-custom-label-${index}`}
                />
                <Input
                  value={field.value}
                  onChange={(e) => updateField(index, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                  data-testid={`input-custom-value-${index}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeField(index)}
                  className="text-destructive"
                  data-testid={`button-remove-custom-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm text-center py-4">
          No custom fields added yet. Use this section for any additional information ZEKE should know.
        </p>
      )}

      <Button
        onClick={() => onSave(fields)}
        disabled={isSaving}
        data-testid="button-save-custom"
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? "Saving..." : "Save Custom Fields"}
      </Button>
    </div>
  );
}

export default function ProfilePage() {
  const { toast } = useToast();
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery<FullProfile>({
    queryKey: ["/api/profile"],
  });

  const saveSectionMutation = useMutation({
    mutationFn: async ({ section, data }: { section: string; data: unknown }) => {
      setSavingSection(section);
      await apiRequest("PUT", `/api/profile/${section}`, { data });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Saved",
        description: `${SECTION_CONFIG[variables.section as keyof typeof SECTION_CONFIG]?.label || variables.section} saved successfully.`,
      });
      setSavingSection(null);
    },
    onError: (error) => {
      toast({
        title: "Error saving",
        description: "Please try again.",
        variant: "destructive",
      });
      setSavingSection(null);
    },
  });

  const handleSaveSection = (section: string, data: unknown) => {
    saveSectionMutation.mutate({ section, data });
  };

  if (isLoading) {
    return (
      <div className="h-full bg-background" data-testid="profile-page">
        <header className="sticky top-0 z-10 h-11 sm:h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-2 sm:gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold">My Profile</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto p-3 sm:p-4 pb-6 sm:pb-8">
          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 sm:h-16 w-full" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="bg-background" data-testid="profile-page">
        <header className="sticky top-0 z-10 h-11 sm:h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-2 sm:gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold">My Profile</h1>
          </div>
        </header>

        <main className="max-w-3xl mx-auto p-3 sm:p-4 pb-6 sm:pb-8">
          <div className="mb-4 sm:mb-6">
            <p className="text-muted-foreground text-xs sm:text-sm">
              Tell ZEKE about yourself so it can be a more effective personal assistant. The more context you provide, the better ZEKE can help you.
            </p>
          </div>

          <GettingToKnowYouChat />

          <Accordion
            type="single"
            collapsible
            className="space-y-2 sm:space-y-4"
            data-testid="tabs-profile-sections"
          >
            <AccordionItem value="basic_info" className="border rounded-lg px-2 sm:px-4">
              <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                  </div>
                  <span className="font-medium text-sm sm:text-base">Basic Info</span>
                </div>
              </AccordionTrigger>
            <AccordionContent>
              <BasicInfoSection
                data={profile?.basicInfo || { fullName: "" }}
                onSave={(data) => handleSaveSection("basic_info", data)}
                isSaving={savingSection === "basic_info"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="work" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-green-500/10">
                  <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Work</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <WorkSection
                data={profile?.work || {}}
                onSave={(data) => handleSaveSection("work", data)}
                isSaving={savingSection === "work"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="family" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-pink-500/10">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Family</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <FamilySection
                data={profile?.family || {}}
                onSave={(data) => handleSaveSection("family", data)}
                isSaving={savingSection === "family"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="interests" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-red-500/10">
                  <Heart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Interests</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <InterestsSection
                data={profile?.interests || {}}
                onSave={(data) => handleSaveSection("interests", data)}
                isSaving={savingSection === "interests"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="preferences" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10">
                  <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Preferences</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <PreferencesSection
                data={profile?.preferences || {}}
                onSave={(data) => handleSaveSection("preferences", data)}
                isSaving={savingSection === "preferences"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="goals" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-yellow-500/10">
                  <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Goals</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <GoalsSection
                data={profile?.goals || {}}
                onSave={(data) => handleSaveSection("goals", data)}
                isSaving={savingSection === "goals"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="health" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10">
                  <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Health</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <HealthSection
                data={profile?.health || {}}
                onSave={(data) => handleSaveSection("health", data)}
                isSaving={savingSection === "health"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="routines" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-orange-500/10">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Routines</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <RoutinesSection
                data={profile?.routines || {}}
                onSave={(data) => handleSaveSection("routines", data)}
                isSaving={savingSection === "routines"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="important_dates" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-cyan-500/10">
                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Important Dates</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ImportantDatesSection
                data={profile?.importantDates || []}
                onSave={(data) => handleSaveSection("important_dates", data)}
                isSaving={savingSection === "important_dates"}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="custom" className="border rounded-lg px-2 sm:px-4">
            <AccordionTrigger className="hover:no-underline py-3 sm:py-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-gray-500/10">
                  <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                </div>
                <span className="font-medium text-sm sm:text-base">Custom Fields</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CustomFieldsSection
                data={profile?.custom || []}
                onSave={(data) => handleSaveSection("custom", data)}
                isSaving={savingSection === "custom"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
    </div>
    </ScrollArea>
  );
}
