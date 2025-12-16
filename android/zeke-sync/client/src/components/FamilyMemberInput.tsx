import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link2, X, Plus, User } from "lucide-react";
import type { FamilyMemberRef, Contact } from "@shared/schema";
import { getContactFullName } from "@shared/schema";

interface FamilyMemberInputProps {
  value: FamilyMemberRef | FamilyMemberRef[] | undefined;
  onChange: (value: FamilyMemberRef | FamilyMemberRef[] | undefined) => void;
  placeholder: string;
  testIdPrefix: string;
  mode: "single" | "array";
}

export function FamilyMemberInput({
  value,
  onChange,
  placeholder,
  testIdPrefix,
  mode,
}: FamilyMemberInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const members: FamilyMemberRef[] = mode === "single"
    ? (value ? [value as FamilyMemberRef] : [])
    : ((value as FamilyMemberRef[]) || []);

  const isSearching = inputValue.includes("@");
  const queryPart = isSearching ? inputValue.split("@").pop() || "" : "";

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts/search", searchQuery],
    enabled: isSearching && queryPart.length >= 1,
  });

  useEffect(() => {
    if (isSearching && queryPart.length >= 1) {
      setSearchQuery(queryPart);
      setIsPopoverOpen(true);
    } else {
      setIsPopoverOpen(false);
    }
  }, [isSearching, queryPart]);

  const addMember = (member: FamilyMemberRef) => {
    if (mode === "single") {
      onChange(member);
    } else {
      const currentMembers = (value as FamilyMemberRef[]) || [];
      onChange([...currentMembers, member]);
    }
    setInputValue("");
    setIsPopoverOpen(false);
  };

  const handleContactSelect = (contact: Contact) => {
    const displayName = getContactFullName(contact);
    addMember({
      contactId: contact.id,
      displayName,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      if (!isSearching) {
        addMember({ displayName: inputValue.trim() });
      } else if (contacts.length === 1) {
        handleContactSelect(contacts[0]);
      }
    }
    if (e.key === "Escape") {
      setIsPopoverOpen(false);
    }
  };

  const handleAddClick = () => {
    if (inputValue.trim() && !isSearching) {
      addMember({ displayName: inputValue.trim() });
    }
  };

  const removeMember = (index: number) => {
    if (mode === "single") {
      onChange(undefined);
    } else {
      const currentMembers = (value as FamilyMemberRef[]) || [];
      onChange(currentMembers.filter((_, i) => i !== index));
    }
  };

  const showInput = mode === "array" || members.length === 0;

  return (
    <div className="space-y-2">
      {showInput && (
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <div className="flex gap-1.5 sm:gap-2">
            <PopoverTrigger asChild>
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="text-sm pr-8"
                  data-testid={`input-${testIdPrefix}-new`}
                />
                {isSearching && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                    @
                  </span>
                )}
              </div>
            </PopoverTrigger>
            <Button
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={handleAddClick}
              disabled={!inputValue.trim() || isSearching}
              data-testid={`button-add-${testIdPrefix}`}
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-1"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {isLoading ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                Searching...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No contacts found
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {contacts.map((contact) => {
                  const displayName = getContactFullName(contact);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className="w-full flex items-center gap-2 p-2 text-sm rounded-sm hover-elevate cursor-pointer text-left"
                      onClick={() => handleContactSelect(contact)}
                      data-testid={`option-contact-${contact.id}`}
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{displayName}</div>
                        {contact.relationship && contact.relationship.trim() !== "" && (
                          <div className="text-xs text-muted-foreground truncate">
                            {contact.relationship}
                          </div>
                        )}
                      </div>
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
            <div className="border-t mt-1 pt-1 px-2 pb-1">
              <p className="text-xs text-muted-foreground">
                Type @ followed by a name to search contacts
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {members.map((member, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="gap-0.5 sm:gap-1 pr-0.5 sm:pr-1 text-xs sm:text-sm"
          >
            {member.contactId && (
              <Link2 className="h-3 w-3 text-primary shrink-0" />
            )}
            <span data-testid={`text-${testIdPrefix}-${index}`}>
              {member.displayName}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-4 w-4 p-0"
              onClick={() => removeMember(index)}
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
